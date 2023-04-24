## Chain of Command - contextual helper class

At times, when extending Microsoft's standard code, you may encounter a lack of available contextual information. While extending standard code using the chain of command is possible, there may not always be a way to transport required information down the call stack.

Suppose you have a method that is extensible using the chain of command, but there is a private or non-extensible Microsoft object or method in between. Usually, you would request an extension point for that object or method, but Microsoft may decline the request or make the extension available in a later (and too late) version.

In such cases, the "ContextHelper" class can be helpful.

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

The ContextHelper class serves as a singleton class that stores information for the current execution scope ("using" block) in the form of a contract class or a plain record. This helps transport information down the call stack.

For example, when a user submits a timesheet, standard code overrides the cost price. To allow zero cost price hours, you need to extend the TSTimesheetTrans.setCostPrice method.

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

Add the contract class to the ContextHelper singleton in the validateSubmit method of the TSTimsheetLine class. This ensures that the cost price remains zero when validating the timesheet.


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

The ContextHelper class is a session-based singleton class, ensuring no interference with other sessions. By utilizing scoping, you can ensure that your logic executes only for the intended use case. In the example above, the cost price will only be set to zero when the user submits the timesheet to the workflow and not when called from elsewhere.

However, be aware of the downsides, and consider using the ContextHelper class only as a last resort.
