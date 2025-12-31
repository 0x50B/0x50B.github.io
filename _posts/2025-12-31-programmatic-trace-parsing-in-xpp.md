---
layout: post
title: "Programmatic Trace Parsing in X++"
tags: [X++, TraceParser, Performance]
---

Debugging performance issues or verifying complex execution flows often requires the Trace Parser tool. However, manually recording traces, exporting ETL files, and opening them in the external Trace Parser application can be tedious—especially if you want to automate checks or log execution paths directly within code.

In this post, we explore how to build a **Custom Trace Parser** directly in X++. By leveraging the standard `Microsoft.Dynamics.AX.Services.Tracing.TraceParser` libraries (the same ones used by the "Troubleshoot" app in the standard application), we can start, stop, and parse traces entirely via code.

### The Challenge

The standard Trace Parser is a powerful GUI tool, but accessing that data programmatically is difficult. The event definitions are often internal, and mapping SQL bind variables to their statements requires complex logic.

However, the D365FO environment includes the necessary DLLs to handle this. Specifically, we can utilize:
* `Microsoft.Dynamics.AX.Services.Tracing.TraceParser.dll`
* `Microsoft.Dynamics.AX.Services.Tracing.Crimson.dll`

### The Solution

We can create a wrapper class that implements `System.IDisposable`. This allows us to use a `using` block to automatically start a trace and ensure it stops and cleans up the ETL file when execution finishes.

The core components of this solution are:
1.  **SysTraceController**: To start and stop the session tracing.
2.  **EventTraceWatcher**: To read the generated ETL file.
3.  **SqlFormatter**: To inject bind variables back into the SQL statements for readability.

### The Implementation

Below is a custom class, `DataScriptTraceParser_BET`, that handles the orchestration. Note that we have to define some `EventId` constants manually (like `24500` for Method Enter) because the original enum is not accessible by X++.

```xpp
using Microsoft.Dynamics.AX.Services.Tracing.TraceParser;
using Microsoft.Dynamics.AX.Services.Tracing.TraceParser.DataServices;
using Microsoft.Dynamics.AX.Services.Tracing.TraceParser.TraceEvents;
using Microsoft.Dynamics.AX.Services.Tracing.Crimson;
using Microsoft.Dynamics.AX.Services.Tracing.TraceParser.Presentation;
using System.Diagnostics.Eventing.Reader;

final internal class DataScriptTraceParser_BET implements System.IDisposable
{
    // EventId values are usually found in:
    // Microsoft.Dynamics.AX.Services.Tracing.TraceParser.TraceEvents.MicrosoftDynamicsAXExecutionTracesFactory+RainierXppEventDescriptors

    // SQL Events
    private const str PropertySqlStatement = 'sqlStatement';
    private const str PropertySqlBindVarValue = 'parameterValue';
    private const str PropertySqlColumnId = 'sqlColumnId';
    private const int AosSqlStatementExecutionLatency = 4922;
    private const int AosSqlStatementInputBind = 4923;

    // XPP Events
    private const str PropertyMethodName = 'methodName';
    private const int XppMethodEnter = 24500;
    private const int XppMethodExit = 24501;    

    private static TraceParserOrchestrator traceParserOrchestrator = new TraceParserOrchestrator();

    private str traceName;
    private boolean imported;
    private boolean isRunning;
    private Filename etlFileName;
    private BindVariables BindParameters = new BindVariables();
    private Map sqlStatements = new Map(Types::Integer, Types::String);
    private Map sqlStatementsWithValues = new Map(Types::Integer, Types::String);

    private List xppExecutionLog = new List(Types::String);     
    private int stackDepth = 0;

    [Hookable(false)]
    internal void startTrace()
    {
        SysTraceController::startTrace(traceName);
        isRunning = true;
        // Give the system a moment to initialize the trace session
        this.awaitTraceParser();
    }

    [Hookable(false)]
    internal void stopTrace()
    {
        if (isRunning)
        {
            this.awaitTraceParser();
            SysTraceController::stopTrace(traceName);
            isRunning = false;
            // Retrieve the path to the generated ETL file
            etlFileName = traceParserOrchestrator.GetEtlFilePath(traceName);
        }
    }

    // The core parsing logic
    private void parseEtlRow(System.Object _sender, EventArrivedEventArgs _e)
    {
        var factory = AxTraceEventFactory::GetFactory(_e.Header.ProviderId);
        if (factory == null || !AxTraceEventFactory::IsDynamicsProvider(_e.Header.ProviderId))
        {
            return;
        }
        
        AxTraceEvent traceEvent = factory.Create(_e);
        
        // Filter only for the current thread to avoid noise
        if (traceEvent.ActivityId != getCurrentThreadActivityId())
        {
            return;
        }
        
        var bindValues = BindParameters.Values;
        str indent = this.getIndentString(stackDepth);

        switch (traceEvent.EventId)
        {
            case XppMethodEnter:
                str method = 'Unknown';
                if (_e.Properties.ContainsKey(PropertyMethodName))
                {
                    method = _e.Properties.Get_Item(PropertyMethodName).ToString();
                }
                
                xppExecutionLog.addEnd(strFmt('XPP->%1|%2', indent, method));
                stackDepth++;
                break;

            case XppMethodExit:
                stackDepth--;
                if (stackDepth < 0) stackDepth = 0;
                break;

            case AosSqlStatementExecutionLatency:
                if (_e.Properties.ContainsKey(PropertySqlStatement))
                {
                    str sqlStatement = _e.Properties.Get_Item(PropertySqlStatement);
                    // This is the magic: Rehydrating the SQL with parameters
                    str sqlStatementWithValues = SqlFormatter::BindParameters(sqlStatement, bindValues.Values);
                    
                    sqlStatements.add(sqlStatements.elements(), sqlStatement);
                    sqlStatementsWithValues.add(sqlStatementsWithValues.elements(), sqlStatementWithValues);

                    xppExecutionLog.addEnd(strFmt('SQL->%1|%2', indent, sqlStatementWithValues));
                }
                bindValues.Clear();
                break;

            case AosSqlStatementInputBind:
                // Capture bind variables as they happen before the SQL execution event
                if (_e.Properties.ContainsKey(PropertySqlColumnId) &&
                    _e.Properties.ContainsKey(PropertySqlBindVarValue))
                {
                    int columnId = any2Int(_e.Properties.Get_Item(PropertySqlColumnId).ToString())-1;
                    str parameterValue = _e.Properties.Get_Item(PropertySqlBindVarValue);
                    
                    if (bindValues.ContainsKey(columnId))
                    {
                        bindValues.Clear();
                    }
                    bindValues.Add(columnId, parameterValue);
                }
                break;
        }
    }

    private str getIndentString(int _depth)
    {
        const str prefixStr = '|-';
        System.Text.StringBuilder sb = new System.Text.StringBuilder();
        for (int i=0; i < _depth; i++)
        {
            sb.Append(prefixStr);
        }
        return sb.ToString();
    }

    [Hookable(false)]
    internal void import()
    {
        if (isRunning)
        {
            this.stopTrace();
        }

        if (etlFileName)
        {
            AxTraceEventFactory::PrepareProivdersMap();

            using (var watcher = new EventTraceWatcher())
            {
                watcher.EventArrived += eventhandler(this.parseEtlRow);
                try
                {
                    // Replay the ETL file through our parser
                    watcher.ProcessTrace(etlFileName);
                }
                finally
                {
                    watcher.EventArrived -= eventhandler(this.parseEtlRow);
                }
            }
            imported = true;
        }
    }

    private void awaitTraceParser()
    {
        infolog.yield();
        sleep(5000); // Wait for flush
        infolog.yield();
    }

    [Hookable(false)]
    internal List xppExecutionLog()
    {
        if (!imported)
        {
            this.import();
        }
        return xppExecutionLog;
    }

    [Hookable(false)]
    public void Dispose()
    {
        if (isRunning)
        {
            SysTraceController::cancelTrace(traceName);
        }

        // Clean up the temporary ETL file
        if (etlFileName && System.IO.File::Exists(etlFileName))
        {
            traceParserOrchestrator.Cleanup(traceName);
        }
    }

    [Hookable(false)]
    static internal DataScriptTraceParser_BET newFromTraceName(str _traceName)
    {
        DataScriptTraceParser_BET traceParser = new DataScriptTraceParser_BET();
        traceParser.traceName = _traceName;
        return traceParser;
    }
}
```

### How to use it

Using the class is straightforward. You wrap the code you want to analyze in a `using` block. Once the block exits, the trace stops, the parser runs, and you can inspect the `xppExecutionLog` list.

Here is a test runnable class - note that everything is printed to infolog, which might not be really useful. This is only for demonstration purposes:

```xpp
internal final class DataScriptTraceParserTest_BET
{
    public static void main(Args _args)
    {
        // Generate a unique trace name
        str traceName = 'TestTrace_' + guid2Str(newGuid());
        
        using (DataScriptTraceParser_BET traceParser = DataScriptTraceParser_BET::newFromTraceName(traceName))
        {
            try
            {
                traceParser.startTrace();
                
                // --- Code to analyze starts here ---
                DataScriptTraceParserTest_BET::performDatabaseOperations();
                // --- Code to analyze ends here ---

                traceParser.stopTrace();
                
                // Iterate over the captured log
                List log = traceParser.xppExecutionLog();
                ListEnumerator enumerator = log.getEnumerator();
            
                info(strFmt('Captured %1 events.', log.elements()));

                while (enumerator.moveNext())
                {
                    info(enumerator.current());
                }
            }
            catch (Exception::Error)
            {
                error('An error occurred during tracing.');
                traceParser.Dispose();
            }
        }
    }

    private static void performDatabaseOperations()
    {
        FeatureTable_BET featureTable;
        select firstonly featureTable; // This SQL will be captured
        info(featureTable.feature().getDescription()); // This X++ call will be captured
    }
}
```

This is the output. As you can see, we get the full X++ call stack, including the SQL traces between the method calls.
As noted previously, in this form (info messages) it's not really useful.
```
XPP->|-|-|Dynamics.AX.Application.xInfo::yield
XPP->|-|Dynamics.AX.Application.DataScriptTraceParser_BET::awaitTraceParser
XPP->|Dynamics.AX.Application.DataScriptTraceParser_BET::stopTrace
XPP->|-|-|-|-|Dynamics.AX.Application.xInfo::add
XPP->|-|-|-|-|-|-|-|Dynamics.AX.Application.xInfo::line
XPP->|-|-|-|-|-|-|Dynamics.AX.Application.Info::line
XPP->|-|-|-|-|-|Dynamics.AX.Application.xGlobal::infologLine
XPP->|-|-|-|-|Dynamics.AX.Application.Global::infologLine
--- redacted ---
XPP->|-|-|-|Dynamics.AX.Application.FeatureFactoryAttribute_BET::new
XPP->|-|-|Dynamics.AX.Application.FeatureStateProvider_BET::createFeatureInstance
XPP->|-|Dynamics.AX.Application.FeatureTable_BET::feature
SQL->|-|SELECT TOP 1 T1.FEATURECLASS,T1.ACTIVE,T1.MODIFIEDDATETIME,T1.MODIFIEDBY,T1.CREATEDDATETIME,T1.CREATEDBY,T1.RECVERSION,T1.PARTITION,T1.RECID FROM FEATURETABLE_BET T1 WHERE ((PARTITION=5637144576) AND (DATAAREAID=N'rchx'))
SQL->|-|{call SysSetConnectionContextInfo ('raphael.bucher',4408,'CLIENT - read-only',0)}
XPP->|Dynamics.AX.Application.DataScriptTraceParserTest_BET::performDatabaseOperations
XPP->|Dynamics.AX.Application.xInfo::yield

Captured 297 X++ events.
```

### Summary

This approach allows for highly specific, code-driven performance analysis. You could extend this to:
* Assert that a specific method only calls SQL once.
* Log the actual SQL queries generated by complex queries.
* Automate performance regression testing in your build pipeline using unit tests.

By wrapping the complexity of `EventTraceWatcher` and `TraceParserOrchestrator`, we unlock the ability to treat execution traces as just another data source in X++.
