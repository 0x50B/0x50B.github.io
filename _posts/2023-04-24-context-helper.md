---
categories: X++
tags: X++
---
## Chain of Command - contextual helper class

When you extend Microsoft's standard code, the context you need is sometimes missing. Chain of Command lets you extend that code, but you cannot always pass the extra information down the call stack.

![context helper](/img/posts/contexthelper.png)

Suppose the method you need is extensible with Chain of Command, but a private or non-extensible Microsoft object sits between you and the code you actually want to influence. You would normally ask Microsoft for an extension point. They may reject the request, or ship it in a later version that arrives too late.

In that situation, a `ContextHelper` class can bridge the gap.

```axapta
final class ContextHelper implements System.IDisposable
{
    private static ContextHelper instance;

    private Map contractMap;
    private Map recordMap;

    private void new() { }

    public void dispose()
    {
        instance = null;
    }

    public static ContextHelper instance()
    {
        if (! instance)
        {
            instance = new ContextHelper();
            instance.initialize();
        }
        return instance;
    }

    private void initialize()
    {
        contractMap = new Map(Types::Integer, Types::Class);
        recordMap = new Map(Types::Integer, Types::Record);
    }

    public void insert(Object _contract)
    {
        contractMap.insert(classIdGet(_contract), _contract);
    }

    public void insertRecord(Common _record)
    {
        recordMap.insert(_record.TableId, _record);
    }

    public boolean exists(int _classId)
    {
        return contractMap.exists(_classId);
    }

    public boolean existsRecord(TableId _tableId)
    {
        return recordMap.exists(_tableId);
    }

    public Object lookup(int _classId)
    {
        if (this.exists(_classId))
        {
            return contractMap.lookup(_classId);
        }
        return null;
    }

    public Common lookupRecord(TableId _tableId)
    {
        if (this.existsRecord(_tableId))
        {
            return recordMap.lookup(_tableId);
        }
        return null;
    }

    public boolean remove(int _classId)
    {
        return contractMap.remove(_classId);
    }

    public boolean removeRecord(TableId _tableId)
    {
        return recordMap.remove(_tableId);
    }

}
```

`ContextHelper` is a singleton that stores a contract class, or a plain record, for the current `using` scope. That is how the extra information travels down the call stack.

For example, when a user submits a timesheet, standard code overwrites the cost price. To keep hours that have a cost price of zero, extend `TSTimesheetTrans.setCostPrice`.

```axapta
internal final class TSTimesheetLineValidateSubmitContract
{
    private boolean allowZeroCostPrice;

    public boolean parmAllowZeroCostPrice(boolean _allowZeroCostPrice = allowZeroCostPrice)
    {
        allowZeroCostPrice = _allowZeroCostPrice;
        return allowZeroCostPrice;
    }

    protected void new() {}

    public static TSTimesheetLineValidateSubmitContract construct()
    {
        return new TSTimesheetLineValidateSubmitContract();
    }

}
```

```axapta
[ExtensionOf(tableStr(TSTimesheetLine))]
final class TSTimesheetLine_Extension
{
    public boolean validateSubmit(boolean _showInfolog, boolean _deleteZeroHourLines)
    {
        boolean validateSubmit;

        using (var contextHelper = ContextHelper::instance())
        {
            TSTimesheetLineValidateSubmitContract contract = TSTimesheetLineValidateSubmitContract::construct();
            contract.parmAllowZeroCostPrice(true);

            contextHelper.insert(contract);
            validateSubmit = next validateSubmit(_showInfolog, _deleteZeroHourLines);
        }

        return validateSubmit;
    }
}
```

Put the contract on the `ContextHelper` singleton in `TSTimesheetLine.validateSubmit`. The cost price then stays at zero while the timesheet is validated.


```axapta
[ExtensionOf(tablestr(TSTimesheetTrans))]
final class TSTimesheetTransTable_Extension
{
    public void setCostPrice(TSTimesheetLine _timesheetLine)
    {
        boolean origCostPriceIsZero = this.CostPrice == 0;

        next setCostPrice(_timesheetLine);

        if (origCostPriceIsZero)
        {
            TSTimesheetLineValidateSubmitContract contract = ContextHelper::instance()
                .lookup(classNum(TSTimesheetLineValidateSubmitContract));

            if (contract && contract.parmAllowZeroCostPrice())
            {
                this.CostPrice = 0;
            }
        }
    }

}
```

`ContextHelper` is a session-based singleton, so one session does not interfere with another. The `using` scope also limits the logic to the case you intended. In the example above, the cost price is set back to zero only when the user submits the timesheet to workflow, not when `setCostPrice` is called from somewhere else.

Keep the downsides in mind, and use `ContextHelper` only as a last resort.
