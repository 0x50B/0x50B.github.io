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
* `Microsoft.Dynamics.AX.Services.Tracing.TraceParser.dll` (Referenced in ApplicationSuite)
* `Microsoft.Dynamics.AX.Services.Tracing.Crimson.dll` (Referenced in AppTroubleshooting)

### The Solution

We can create a wrapper class that implements `System.IDisposable`. This allows us to use a `using` block to automatically start a trace and ensure it stops and cleans up the ETL file when execution finishes.

The core components of this solution are:
1.  **SysTraceController**: To start and stop the session tracing.
2.  **EventTraceWatcher**: To read the generated ETL file.
3.  **SqlFormatter**: To inject bind variables back into the SQL statements for readability.

### The Implementation

Below is a custom class, `SysTraceParser_BET`, that handles the orchestration. Note that we have to define some `EventId` constants manually (like `24500` for Method Enter) because the original enum is not accessible by X++.

```xpp
using Microsoft.Dynamics.AX.Services.Tracing.TraceParser;
using Microsoft.Dynamics.AX.Services.Tracing.TraceParser.DataServices;
using Microsoft.Dynamics.AX.Services.Tracing.TraceParser.TraceEvents;
using Microsoft.Dynamics.AX.Services.Tracing.Crimson;
using Microsoft.Dynamics.AX.Services.Tracing.TraceParser.Presentation;
using System.Diagnostics.Eventing.Reader;

final internal class SysTraceParser_BET implements System.IDisposable
{
    // EventId values are set in enum Microsoft.Dynamics.AX.Services.Tracing.TraceParser.TraceEvents.MicrosoftDynamicsAXExecutionTracesFactory+RainierXppEventDescriptors
    // these are not accessible directly in x++, so we define them here again

    // SQL
    private const str PropertySqlStatement = 'sqlStatement';
    private const str PropertySqlBindVarValue = 'parameterValue';
    private const str PropertySqlColumnId = 'sqlColumnId';
    private const str PropertyExecutionTimeSeconds = 'executionTimeSeconds'; // New constant
    private const int AosSqlStatementExecutionLatency = 4922;
    private const int AosSqlStatementInputBind = 4923;

    // XPP
    private const str PropertyMethodName = 'methodName';
    private const int XppMethodEnter = 24500;
    private const int XppMethodExit = 24501;    

    private static TraceParserOrchestrator traceParserOrchestrator = new TraceParserOrchestrator();

    private str traceName;
    private SysTraceParserTable_BET traceParserTable;
    private boolean persistLog;

    private int traceId;
    private boolean imported;
    private boolean isRunning;
    private Filename etlFileName;
    private BindVariables BindParameters = new BindVariables();
    private Map sqlStatements = new Map(Types::Integer, Types::String);
    private Map sqlStatementsWithValues = new Map(Types::Integer, Types::String);

    private int stackDepth = 0;
    
    private SysTraceParserCallTreeNode_BET rootNode, currentNode;

    private void init()
    {
        rootNode = new SysTraceParserCallTreeNode_BET(SysTraceParserCallTreeNodeType_BET::Xpp);
        rootNode.IsRootNode = true;

        currentNode = rootNode;
    }

    internal void startTrace(boolean _persistLog = false)
    {
        System.Exception exception;
        try
        {
            if (_persistLog && !traceParserTable)
            {
                traceParserTable = SysTraceParserTable_BET::create(traceName, SysTraceMarkerType_BEC::ThreadId, guid2Str(getCurrentThreadActivityId()));
            }

            SysTraceParserTable_BET::start(traceParserTable);            

            TraceParserOrchestrator::StartTraceOptimized(traceName);
            isRunning = true;            
        }
        catch(exception)
        {
            error(exception.get_Message());
        }

        if (isRunning)
        {
            this.awaitTraceParser();
        }
    }

    internal void stopTrace()
    {
        if (!isRunning)
        {
            return;
        }

        this.awaitTraceParser();

        System.Exception exception;
        try
        {
            TraceParserOrchestrator::StopTrace(traceName);
            isRunning = false;
        }
        catch(exception)
        {
            error(exception.get_Message());
        }

        if (!isRunning)
        {
            etlFileName = traceParserOrchestrator.GetEtlFilePath(traceName);

            SysTraceParserTable_BET::stop(traceParserTable, etlFileName);
        }
    }

    private void parseEtlRow(System.Object _sender, EventArrivedEventArgs _e)
    {
        var factory = AxTraceEventFactory::GetFactory(_e.Header.ProviderId);
        if (factory == null)
        {
            return;
        }

        if(!AxTraceEventFactory::IsDynamicsProvider(_e.Header.ProviderId))
        {
            return;
        }
        
        AxTraceEvent traceEvent = factory.Create(_e); 
        
        if (traceParserTable && traceParserTable.MarkerType == SysTraceMarkerType_BEC::ThreadId)
        {
            if (guid2Str(traceEvent.ActivityId) != traceParserTable.MarkerName)
            {
                return;
            }
        }
        // if user selected, traceEvent.SessionName contains user guid
        // also check if is batch or user?
        // if (...)
        else if (traceEvent.ActivityId != getCurrentThreadActivityId())
        {
            return;
        }        

        var bindValues = BindParameters.Values;

        Microsoft.Dynamics.AX.Services.Tracing.Crimson.EventHeader header = _e.Header;
        int64 currentTicks = header.TimeStamp; 

        switch (traceEvent.EventId)
        {
            case XppMethodEnter:
                str method = 'Unknown';
                if (_e.Properties.ContainsKey(PropertyMethodName))
                {
                    method = _e.Properties.Get_Item(PropertyMethodName).ToString();
                }

                SysTraceParserCallTreeNode_BET xppNode = new SysTraceParserCallTreeNode_BET(SysTraceParserCallTreeNodeType_BET::Xpp, currentNode);
                xppNode.StartTicks = currentTicks;
                xppNode.ExecutionLog = method;
                xppNode.StackDepth = stackDepth;

                currentNode.addChild(xppNode);

                currentNode = xppNode;
                
                stackDepth++;
                break;

            case XppMethodExit:
                if (currentNode != null && currentNode != rootNode)
                {
                    currentNode.DurationMs = (currentTicks - currentNode.StartTicks) / 10000;

                    currentNode = currentNode.Parent;

                    stackDepth--;
                    if (stackDepth < 0)
                    {
                        stackDepth = 0;
                    }
                }
                break;

            case AosSqlStatementExecutionLatency:
                if (_e.Properties.ContainsKey(PropertySqlStatement))
                {
                    str sqlStatement = _e.Properties.Get_Item(PropertySqlStatement);
                    str sqlStatementWithValues = SqlFormatter::BindParameters(sqlStatement, bindValues.Values);
                    sqlStatements.add(sqlStatements.elements(), sqlStatement);
                    sqlStatementsWithValues.add(sqlStatementsWithValues.elements(), sqlStatementWithValues);

                    real sqlDurationMs = 0;
                    if (_e.Properties.ContainsKey(PropertyExecutionTimeSeconds))
                    {
                        sqlDurationMs = any2Real(_e.Properties.Get_Item(PropertyExecutionTimeSeconds)) / 1000;
                    }

                    SysTraceParserCallTreeNode_BET sqlNode = new SysTraceParserCallTreeNode_BET(SysTraceParserCallTreeNodeType_BET::Sql, currentNode);
                    sqlNode.StartTicks = currentTicks;
                    sqlNode.ExecutionLog = sqlStatementWithValues;
                    sqlNode.DurationMs = sqlDurationMs;
                    sqlNode.StackDepth = stackDepth;
                    
                    currentNode.addChild(sqlNode);
                }
                bindValues.Clear();
                break;

            case AosSqlStatementInputBind:
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
                    watcher.ProcessTrace(etlFileName);
                    imported = true;
                }
                finally
                {
                    watcher.EventArrived -= eventhandler(this.parseEtlRow);
                }
            }            
        }
    }

    private void awaitTraceParser()
    {
        infolog.yield();
        sleep(5000);
        infolog.yield();
    }

    internal Map sqlStatementsWithParameterValues()
    {
        return sqlStatementsWithValues;
    }

    internal Map sqlStatements()
    {
        if (!imported)
        {
            this.import();
        }
        
        return sqlStatements;
    }

    internal SysTraceParserCallTreeNode_BET getCallTreeRootNode()
    {
        if (!imported)
        {
            this.import();
        }
        return rootNode;
    }

    public void Dispose()
    {
        if (isRunning)
        {
            TraceParserOrchestrator::StopTrace(traceName);

            traceParserOrchestrator.Cleanup(traceName);
        }

        if (etlFileName && System.IO.File::Exists(etlFileName))
        {
            traceParserOrchestrator.Cleanup(traceName);
        }
    }

    public void persistTraceParserTable()
    {
        if (!traceParserTable)
        {
            return;
        }

        SysTraceParserCallTreeNode_BET rootNodeLoc = this.getCallTreeRootNode();
        RecordInsertList rilLog = new RecordInsertList(tableNum(SysTraceParserLog_BET), true, true, true, true, true);

        this.persistNode(rootNodeLoc, rilLog);
        
        rilLog.insertDatabase();

    }

    private void persistNode(SysTraceParserCallTreeNode_BET _node, RecordInsertList _ril)
    {
        if (!_node.IsRootNode)
        {
            SysTraceParserLog_BET log;

            log.SysTraceParserTableRefRecId = traceParserTable.RecId;
            log.CallTreeNodeType = _node.NodeType;
            log.SysTraceTextDetails = _node.ExecutionLog;
            log.DurationMs = _node.DurationMs;

            _ril.add(log);
        }

        ListEnumerator it = _node.Children.getEnumerator();
        while (it.moveNext())
        {
            this.persistNode(it.current(), _ril);
        }
    }

    static internal SysTraceParser_BET newFromTraceName(str _traceName)
    {
        Debug::assert(_traceName != '');

        SysTraceParser_BET traceParser = new SysTraceParser_BET();
        traceParser.traceName = _traceName;

        traceParser.init();

        return traceParser;
    }

    static internal SysTraceParser_BET newFromTraceTable(SysTraceParserTable_BET _traceParserTable)
    {
        Debug::assert(_traceParserTable.TraceName != '');

        SysTraceParser_BET traceParser = new SysTraceParser_BET();

        if (_traceParserTable.EtlFileName)
        {
            traceParser.etlFileName = _traceParserTable.EtlFileName;
        }
        else
        {
            traceParser.traceName = _traceParserTable.TraceName;
            traceParser.traceParserTable = _traceParserTable;
        }

        traceParser.init();

        return traceParser;
    }

}
```

```xpp
internal final class SysTraceParserCallTreeNode_BET
{
    public SysTraceParserCallTreeNodeType_BET NodeType;

    public str ExecutionLog;
    public int64 StartTicks;
    public real DurationMs;
    public int StackDepth;
    public List Children;
    public SysTraceParserCallTreeNode_BET Parent;

    public boolean IsRootNode;

    public void new(SysTraceParserCallTreeNodeType_BET _nodeType, SysTraceParserCallTreeNode_BET _parent = null)
    {
        NodeType = _nodeType;
        Parent = _parent;
        Children = new List(Types::Class);
    }

    public void addChild(SysTraceParserCallTreeNode_BET _child)
    {
        Children.addEnd(_child);
    }

}
```

### How to use it

Using the class is straightforward. You wrap the code you want to analyze in a `using` block. Once the block exits, the trace stops, the parser runs, and you can inspect the `xppExecutionLog` list.

Here is a test runnable class - note that everything is printed to infolog, which might not be really useful. This is only for demonstration purposes:

```xpp
internal final class SysTraceParserTest_BET
{
    public static void main(Args _args)
    {
        str traceName = 'TestTrace_' + guid2Str(newGuid());
        
        using (SysTraceParser_BET traceParser = SysTraceParser_BET::newFromTraceName(traceName))
        {
            try
            {
                traceParser.startTrace(true);
                
                SysTraceParserTest_BET::performDatabaseOperations();

                traceParser.stopTrace();
                
                SysTraceParserTest_BET::printNodeRecursive(traceParser.getCallTreeRootNode());
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
        
        select firstonly featureTable;
        
        info(featureTable.feature().getDescription());
    }

    private static void printNodeRecursive(SysTraceParserCallTreeNode_BET _node)
    {
        if (!_node.IsRootNode)
        {            
            if (_node.NodeType == SysTraceParserCallTreeNodeType_BET::Xpp)
            {
                info(strFmt("%1[XPP] %2 : %3 ms", strRep('.', _node.StackDepth), _node.ExecutionLog, num2Str(_node.DurationMs, 0, 2, 1, 0)));
            }
            else
            {
                info(strFmt("%1[SQL] %2 : %3 ms", strRep('.', _node.StackDepth), _node.ExecutionLog, num2Str(_node.DurationMs, 0, 2, 1, 0)));
            }
        }

        ListEnumerator it = _node.Children.getEnumerator();
        while (it.moveNext())
        {
            SysTraceParserTest_BET::printNodeRecursive(it.current());
        }
    }

}
```

This is the output. As you can see, we get the full X++ call stack, including the SQL traces between the method calls.
As noted previously, in this form (info messages) it's not really useful.
```
..[XPP] Dynamics.AX.Application.xInfo::yield : 0.02 ms
.[XPP] Dynamics.AX.Application.SysTraceParser_BET::awaitTraceParser : 0.00 ms
[XPP] Dynamics.AX.Application.SysTraceParser_BET::stopTrace : 0.00 ms
....[XPP] Dynamics.AX.Application.xInfo::add : 0.21 ms
.......[XPP] Dynamics.AX.Application.xInfo::line : 0.02 ms
......[XPP] Dynamics.AX.Application.Info::line : 0.02 ms
.....[XPP] Dynamics.AX.Application.xGlobal::infologLine : 0.06 ms
....[XPP] Dynamics.AX.Application.Global::infologLine : 0.06 ms
---<REDACTED>---
...[XPP] Dynamics.AX.Application.FeatureFactoryAttribute_BET::new : 0.00 ms
..[XPP] Dynamics.AX.Application.FeatureStateProvider_BET::createFeatureInstance : 22.67 ms
.[XPP] Dynamics.AX.Application.FeatureTable_BET::feature : 22.69 ms
.[SQL] SELECT TOP 1 T1.FEATURECLASS,T1.ACTIVE,T1.MODIFIEDDATETIME,T1.MODIFIEDBY,T1.CREATEDDATETIME,T1.CREATEDBY,T1.RECVERSION,T1.PARTITION,T1.RECID FROM FEATURETABLE_BET T1 WHERE ((PARTITION=5637144576) AND (DATAAREAID=N'rcho')) : 0.00 ms
.[SQL] {call SysSetConnectionContextInfo ('raphael.bucher',25619,'CLIENT - read-only',0)} : 0.00 ms
[XPP] Dynamics.AX.Application.SysTraceParserTest_BET::performDatabaseOperations : 33.27 ms
[XPP] Dynamics.AX.Application.xInfo::yield : 0.14 ms
```

### Summary

This approach allows for highly specific, code-driven performance analysis. You could extend this to:
* Assert that a specific method only calls SQL once.
* Log the actual SQL queries generated by complex queries.
* Automate performance regression testing in your build pipeline using unit tests.

By wrapping the complexity of `EventTraceWatcher` and `TraceParserOrchestrator`, we unlock the ability to treat execution traces as just another data source in X++.
