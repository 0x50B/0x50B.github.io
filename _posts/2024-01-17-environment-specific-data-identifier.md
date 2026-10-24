---
categories: X++
tags: X++
---
## Point-in-time restore and environment-specific data
Every system has data that belongs to that environment. Connection details are a typical example: they point from the current environment to another one.
Those details are often wrong after you restore, for example, a production database to a test or UAT environment.
Microsoft already deletes some of that data when a point-in-time restore (PITR) runs.
See [Data elements that aren't copied during restore copy](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/database/database-pitr-prod-sandbox#data-elements-that-arent-copied-during-restore-copy).

Encrypted fields are on that list. They are deleted because they cannot be decrypted in another sandbox, which has different keys.
What about other data you want to handle when a database moves from one system to another?

## Environment-specific data identifier table
I added a table that stores the environment ID (the same ID you see in LCS).
After a PITR, if the system starts with an environment ID other than the one stored in that table, an event is raised to say that the database has changed for this system.

![SysEnvironmentSpecificDataIdentifier_BEC](/img/posts/SysEnvironmentSpecificDataIdentifier_BEC.png)

## Application startup handler and database environment changed event manager
On startup, `ApplicationStartupEventManager` raises `onSystemStartup`, which you can subscribe to.
That is the trigger for checking whether the database still belongs to this environment.

`DatabaseEnvironmentChangedEventManager_BEC` compares the current environment ID with the one stored in the database.
If they differ, it raises `onDatabaseEnvironmentChanged`. After that, it writes the current environment ID back to the table, so the next startup does not raise the same event again.

```axapta
internal final class ApplicationStartupHandler_BEC
{
    [SubscribesTo(classStr(ApplicationStartupEventManager), staticDelegateStr(ApplicationStartupEventManager, onSystemStartup))]
    public static void ApplicationStartupEventManager_onSystemStartup()
    {
        DatabaseEnvironmentChangedEventManager_BEC::runCheck();
    }
}

internal final class DatabaseEnvironmentChangedEventManager_BEC
{
    public static void raiseDatabaseEnvironmentChanged()
    {
        DatabaseEnvironmentChangedEventManager_BEC::onDatabaseEnvironmentChanged();
    }

    static delegate void onDatabaseEnvironmentChanged() {}

    public static void runCheck()
    {
        SysEnvironmentSpecificDataIdentifier_BEC sysEnvironmentIdentifier = SysEnvironmentSpecificDataIdentifier_BEC::find(true);

        Microsoft.Dynamics.ApplicationPlatform.Environment.IApplicationEnvironment appEnv = Microsoft.Dynamics.ApplicationPlatform.Environment.EnvironmentFactory::GetApplicationEnvironment();        

        if (!appEnv || !appEnv.LCS || !appEnv.LCS.LCSEnvironmentId)
        {
            throw Exception::Error;
        }

        if (sysEnvironmentIdentifier && sysEnvironmentIdentifier.EnvironmentId != appEnv.LCS.LCSEnvironmentId)
        {
            DatabaseEnvironmentChangedEventManager_BEC::raiseDatabaseEnvironmentChanged();
        }

        ttsbegin;
        sysEnvironmentIdentifier.EnvironmentId = appEnv.LCS.LCSEnvironmentId;
        sysEnvironmentIdentifier.write();
        ttscommit;
    }
}
```

## Subscribing to onDatabaseEnvironmentChanged
Where you handle the database-changed event is up to you. Here it is on a parameter table:

```axapta
public class KafkaParameters_BEC extends common
{
    [SubscribesTo(classStr(DatabaseEnvironmentChangedEventManager_BEC), staticDelegateStr(DatabaseEnvironmentChangedEventManager_BEC, onDatabaseEnvironmentChanged))]
    public static void DatabaseEnvironmentChangedEventManager_BEC_onDatabaseEnvironmentChanged()
    {
        KafkaParameters_BEC parameters = KafkaParameters_BEC::find(true);
    
        ttsbegin;
        parameters.ConnectionBootstrapServers = '<DB ENV CHANGED>';
        parameters.ConnectionSaslPassword = '';
        parameters.ConnectionSaslUsername = '';
        parameters.ConnectionEnabled = NoYes::No;
        parameters.write();
        ttscommit;
    }
}
```
