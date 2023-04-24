## Chain of Command - contextual helper class

Sometimes, when extending standard code of Microsoft, there is a lack of contextual information available.
While we can extend the standard code by augumenting with chain of command, sometimes there is just no way of transporting needed information down the "call stack".

For instance, you have a method that is extensible with chain of command, but in between this method call there is a private/not extensible object/method by Microsoft.
Now the usual way is to request an extension point for said object/method, but most of the times Microsoft just declines or the extension is appointed to be available sometime in a later (too late) version.

This is where a "ContextHelper" class is of help.

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

The ContextHelper class acts as a singleton class that can store information for the current execution scope (using pattern), in form of a contract class or just a plain record, to transport "down the call stack".

For instance, when the user wants to submit his timesheet, there is standard code that overrides the cost price. If you want to allow zero cost price hours, you have to extend the TSTimesheetTrans.setCostPrice method.

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

So we add the contract class in the validateSubmit method of the TSTimsheetLine class to the context helper singelton.
This way the cost price is kept at zero when validating the timesheet.


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

The ContextHelper class is a session singleton based class, so there will never be inferences with other sessions.
Also through the scoping of using, you can make sure that the execution of your logic is targeted for the intended use case.
As seen above, the cost price will only be set to zero when the user submits the timesheet to the workflow, and never when called from somewhere else.

There are ofcourse downsides to this and should only be used as a last course of action. 
