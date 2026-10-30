---
layout: post
title: "Why SysTestCaseDataDependency Stalls Unit Test Runs on a UDE"
date: 2026-10-30 16:00:00 +0100
tags: [Dynamics 365, X++, Unit Tests, Power Platform]
---

On a Unified Developer Environment (UDE), we had a set of X++ unit tests that seemed to never finish. The test run started, the environment switched to `ExternalOrchestration`, and the unit test operation kept reporting *"Unit Test execution still in progress."* for three to four hours. During that time the environment was blocked for deployments and other operations.

The tests had one thing in common: they were written against real data and carried a company data dependency:

```xpp
[SysTestCaseDataDependency('XXXX')]
public final class MyLiveDataTest extends SysTestCase
{
    ...
}
```

This post shows an A/B test that isolates the attribute as the cause, walks through the SysTest framework code that explains it, and shows what happens in the database while the run appears to hang.

## The A/B test

To rule out the test logic itself, I created two test classes with identical code. The only difference is the attribute.

```xpp
// Variant A: no data dependency
public final class LiveDataNoDependencyTest extends SysTestCase
{
    private const DataAreaId ExpectedCompany = 'XXXX';
    ...
}

// Variant B: identical, plus the data dependency
[SysTestCaseDataDependency('XXXX')]
public final class LiveDataDependencyTest extends SysTestCase
{
    private const DataAreaId ExpectedCompany = 'XXXX';
    ...
}
```

Both classes contain the same two read-only tests:

```xpp
[SysTestMethod]
public void companyContextIsExpected()
{
    CustTable custTable;
    select count(RecId) from custTable;

    this.assertEquals(ExpectedCompany, strUpr(curExt()), 'Data dependency company must be active.');
    this.assertTrue(custTable.RecId > 0, 'Live customers must be visible in the dependency company.');
}

[SysTestMethod]
public void readLiveSalesData()
{
    CustTable custTable;
    select count(RecId) from custTable;

    AmountCur lineAmountTotal;
    int lineCount;
    SalesTable salesTable;
    SalesLine salesLine;
    while select firstonly100 SalesId from salesTable
    join LineAmount from salesLine
        where salesLine.SalesId == salesTable.SalesId
    {
        lineAmountTotal += salesLine.LineAmount;
        lineCount++;
    }

    this.assertNotEqual('', curExt());
}
```

I ran the classes one after the other, each in its own test run:

| | A: without attribute | B: with `SysTestCaseDataDependency` |
|---|---|---|
| Duration of the whole run | about 2 minutes, mostly orchestration overhead | still running after 30 minutes, no result |
| Duration per test | about 1 second | - |
| Company during the test | `DAT` | the dependency company |
| Environment afterwards | back to `Running` | stays in `ExternalOrchestration` |

Variant A fails `companyContextIsExpected` with `Expected: XXXX; Actual: DAT`. That is expected, and it already hints at what is going on: without the attribute, the test does not run in your data at all.

## How SysTest chooses where a test runs

The attribute itself is tiny. `SysTestCaseDataDependencyAttribute` only forwards to its base class with the default partition key:

```xpp
public class SysTestCaseDataDependencyAttribute extends SysTestCasePartitionDependencyAttribute
{
}

public void new(SelectableDataArea _dataArea = defaultDataArea)
{
    super(defaultPartitionKey, _dataArea);   // #DefaultPartitionKey = 'initial'
}
```

So the attribute does two things. It sets the company the test switches to, and it pins the test to the partition `initial`, which is the partition that holds your actual data.

The partition decision happens in `SysTestService`. By default (`createPartition` in the runner settings), tests run through `runTestsInANewPartition()`:

```xpp
// first pass - run tests in first partition
if (SysTestRuntimePartitionEvaluator::validateSpecifiedTestNameExplicitForCurrentSessionPartition(_executionList.testCaseName()))
{
    firstpassPartitionKey = getcurrentpartition();
}

[resultsInfoPacked, rerunInformationPacked, xmlListenerResultsPacked] =
    this.runTestsInSpecifiedPartition(false, _executionList, _runnerSettings, firstpassPartitionKey);
```

`runTestsInSpecifiedPartition()` then behaves differently depending on the key:

```xpp
if (forceExplicitPartitionForTestDetection && (partitionKey == getcurrentpartition()))
{
    // run directly in the current partition
    results = SysTestService::initializePartitionAndRunTests([...]);
}
else
{
    sysTestServicePartitionManagement = new SysTestServicePartitionManagement();
    ...
    if (!forceExplicitPartitionForTestDetection)
    {
        sysTestServicePartitionManagement.createPartition();   // fresh, empty partition
        partitionKey = sysTestServicePartitionManagement.createdPartitionKey;
    }

    try
    {
        results = runas(curuserid(), classnum(SysTestService),
                        staticmethodstr(SysTestService, initializePartitionAndRunTests),
                        [...], #DATCompany, infolog.language(), partitionKey);
    }
    finally
    {
        if (partitionKey != getcurrentpartition())
        {
            sysTestServicePartitionManagement.deletePartition();
        }
    }
}
```

This means:

* **Without a data dependency**, every test run gets a new, empty partition. The test runs in company `DAT`, and the partition is deleted afterwards. This is why tests are supposed to create their own data, for example with the Acceptance Test Library (ATL).
* **With `SysTestCaseDataDependency`**, the test explicitly asks for partition `initial`. The framework then runs the test directly in that partition, which on a UDE or sandbox contains your real data.

On Microsoft's own build and test environments, `initial` only holds demo data, so this distinction rarely matters there. On a UDE that was copied from a project environment, it does.

## The expensive part: test cleanup in the live partition

After each test class, `SysTestSuite.cleanupData()` calls `Rollback()` on the cleanup object. The base implementation in `SysTestCleanup` looks like this:

```xpp
public void Rollback()
{
    SysTestCleanup::cleanupSysLastValue();
    NumberSeqGlobal::Instance().flushNumberSeqNumCache();
    FormRunConfigurationSessionState::ClearConfigurationSessionState();
    FormRunConfiguration formRunConfiguration;
    ttsbegin;
    delete_from formRunConfiguration
                where formRunConfiguration.Owner != SystemNotificationsWhatsNewManager::WhatsNewKey
                && formRunConfiguration.Owner != SystemNotificationsWhatsNewManager::NavPaneWhatsNewCallOutKey;

    FormRunConfigurationPublishedViewsManager::clearPublishedViews('', 0);
    ttscommit;
}
```

`FormRunConfiguration` is the table behind personalizations and saved views. The cleanup deletes **all** of them, for all users, not only the ones the test created. In a fresh test partition this costs nothing, because the table is empty. In partition `initial` it hits every saved view and personalization in the environment.

On top of that, `FormRunConfiguration` overrides `delete()`. That turns `delete_from` into row-by-row processing, and every deleted configuration also cascades to its property, default view, role, legal entity and linked pin records. On an environment with tens of thousands of saved views and hundreds of thousands of configuration properties, this takes hours. In our original runs it was three to four hours. The test runner waits the whole time, and the UDE orchestration stays in `ExternalOrchestration`.

The actual test methods finished within seconds. What looks like a hanging test is the cleanup after the test.

## What the database shows

If you have SQL access to the environment (on a UDE through the just-in-time database access), you can see this directly. First, look for long-running user sessions with an open transaction:

```sql
SELECT s.session_id, s.login_time, s.last_request_start_time, s.status,
       s.program_name, s.open_transaction_count
FROM sys.dm_exec_sessions s
WHERE s.is_user_process = 1
ORDER BY s.login_time;
```

In our case there was exactly one AOS session (`axDefault`) that logged in shortly after the test run started. It had held a single transaction open ever since and kept sending requests. Its transaction and locks:

```sql
-- size of the open transaction
SELECT at.transaction_begin_time,
       dt.database_transaction_log_record_count AS log_records,
       dt.database_transaction_log_bytes_used   AS log_bytes
FROM sys.dm_tran_session_transactions st
JOIN sys.dm_tran_active_transactions at   ON at.transaction_id = st.transaction_id
JOIN sys.dm_tran_database_transactions dt ON dt.transaction_id = st.transaction_id
WHERE st.session_id = <session_id>;

-- which tables it holds locks on
SELECT OBJECT_NAME(resource_associated_entity_id) AS table_name, request_mode
FROM sys.dm_tran_locks
WHERE request_session_id = <session_id> AND resource_type = 'OBJECT';

-- what it is executing
SELECT t.text
FROM sys.dm_exec_connections c
CROSS APPLY sys.dm_exec_sql_text(c.most_recent_sql_handle) t
WHERE c.session_id = <session_id>;
```

The result left no doubt:

* The session held an IX lock on `SYSTESTTRANSACTIONISOLATION`, so it was the test transaction.
* It held locks on `FORMRUNCONFIGURATION`, `FORMRUNCONFIGURATIONPROPERTY`, `FORMRUNCONFIGURATIONDEFAULTVIEW`, `FORMRUNCONFIGURATIONROLE`, `FORMRUNCONFIGURATIONLEGALENTITY`, `FORMRUNCONFIGURATIONLINKEDPIN` and `FORMRUNCONFIGURATIONPUBLISHEDVIEW`.
* The current statement was `FETCH API_CURSOR...`, which means row-by-row processing.
* The transaction log grew steadily: more than 100,000 log records after 15 minutes, more than 200,000 after 30 minutes.
* There was no blocking and no other long-running query. The environment was not stuck. It was busy.

While this runs, the session holds exclusive page locks on the personalization tables. Users who open forms with saved views on the same environment can be slowed down as well.

## Is the data really deleted?

The delete runs inside a transaction. Whether it is committed at the end is not obvious from the code. `SysTestSavepointCleanupBase` (used for the default `AutoRollback` mode) rolls back the test scope first and only then calls the base implementation that deletes the configurations:

```xpp
public void Rollback()
{
    Microsoft.Dynamics.Ax.Xpp.MetadataExtensions.TableExtensionCleanupScopeManager::get_Instance().RollbackActiveScope();

    super();
}
```

In our observation, the transaction started when the test session logged in and also held the lock on `SYSTESTTRANSACTIONISOLATION`. That suggests the delete is part of the outer isolation transaction and is rolled back at the end. I have not verified that the run actually ends this way. If you run into this, count the rows before and after:

```sql
SELECT COUNT_BIG(*) FROM FORMRUNCONFIGURATION;
```

If the count drops to almost zero after the run, all saved views and personalizations on that environment are gone.

## Side note: ATL on a UDE

The obvious alternative is to drop the data dependency and create test data with ATL, so that the test runs in a fresh partition. On the UDE we used, that did not work either. ATL creates its data through its own tables and data entity views, for example `AtlDataValues` and `AtlEcoResReleasedProductEntity`. Those were never synchronized to the environment's database:

```sql
SELECT COUNT(*) FROM sys.tables WHERE name LIKE 'ATL%';   -- 0
SELECT COUNT(*) FROM sys.views  WHERE name LIKE 'ATL%';   -- 0
```

The tests failed in `setUp()` with *"Cannot select a record in AtlDataValues. The SQL database has issued an error."* Even a simple `data.cust().customers().createDefault()` needs `AtlDataValues`. To use ATL on a UDE, sync the ATL packages first (for example `ATLFoundation`, `ATLApplicationSuite` and the other ATL packages your tests reference). Those test runs ended normally with a failure result, and the environment went back to `Running` each time. ATL-based test runs themselves do not stall the orchestration.

## Takeaways

* `SysTestCaseDataDependency` does more than switch the company. It makes the test run in partition `initial`, which is your real data.
* The SysTest cleanup after each test class deletes all `FormRunConfiguration` records in the partition it runs in. In a test partition that is harmless. In `initial` it processes every saved view and personalization row by row.
* On an environment with real data, this makes a test run take hours (three to four in our case) and keeps the UDE in `ExternalOrchestration`. The test methods themselves are not the problem.
* Do not use `SysTestCaseDataDependency` on a UDE or sandbox that holds real data. Create the test data in the test instead, with ATL or your own setup code, and sync the ATL packages first if you want to use ATL.
* If a test run seems to hang, check the database for one AOS session with a long open transaction before you assume a deadlock.

The analysis is based on platform version `7.0.8199.55`. The classes involved (`SysTestService`, `SysTestCleanup`, `SysTestSavepointCleanupBase`) are in the `ApplicationFoundation` model, so you can check the behavior on your own version in the Application Explorer.
