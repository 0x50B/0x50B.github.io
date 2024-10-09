---
categories: X++
tags: X++
---

## Chain of Command - Contextual Helper Framework (Updated for 2024)

![context helper](/img/posts/contexthelper.png)

When extending Microsoft's standard code in Dynamics 365, passing contextual data down the call stack can sometimes be a challenge. While Chain of Command (CoC) makes it possible to extend standard logic, there are cases where private or non-extensible methods interrupt the flow. Previously, the **ContextHelper** class provided a way to manage this (see previous blog post {% post_url _posts/2023-04-24-context-helper %}, but now a more robust framework has been developed to replace it.

### Introducing the New Context Helper Framework

This new framework consists of multiple classes designed to make managing contract instances easier, more flexible, and more scalable. By introducing a contract registry and factory, the framework handles the lifecycle of context objects automatically. Below are the key components of the framework:

### Key Framework Classes

1. **ContextContractFactoryAttribute_BET** - An attribute class that defines contract types.
2. **ContextContractRegistry_BET** - A singleton registry that manages contract instances.
3. **ContextHelper_BET** - The utility class used to create and retrieve contracts.
4. **IContextContract_BET** - The abstract contract class that implements disposable functionality for contract lifecycle management.

#### ContextContractFactoryAttribute_BET

```xpp
internal final class ContextContractFactoryAttribute_BET extends SysAttribute implements SysExtensionIAttribute
{
    private ClassName className;

    public void new(ClassName _className)
    {
        className = _className;
    }

    public str parmCacheKey()
    {
        return classStr(ContextContractFactoryAttribute_BET) + ';' + className;
    }

    public boolean useSingleton()
    {
        return false;
    }
}
```

#### ContextContractRegistry_BET

```xpp
internal final class ContextContractRegistry_BET implements System.IDisposable
{
    private static ContextContractRegistry_BET instance;
    private Map instanceMap;

    private void init()
    {
        instanceMap = new Map(Types::Integer, Types::Class);
    }

    public static ContextContractRegistry_BET instance()
    {
        if (! instance)
        {
            instance = new ContextContractRegistry_BET();
            instance.init();
        }
        return instance;
    }

    internal void insert(IContextContract_BET _contract)
    {
        instanceMap.insert(classIdGet(_contract), _contract);
    }

    internal void remove(ClassId _classId)
    {
        instanceMap.remove(_classId);
    }

    internal boolean exists(ClassId _classId)
    {
        return instanceMap.exists(_classId);
    }

    internal IContextContract_BET lookup(ClassId _classId)
    {
        return instanceMap.lookup(_classId);
    }

    public void dispose()
    {
        if (instanceMap.empty())
        {
            instanceMap = null;
            instance = null;
        }
    }
}
```

#### ContextHelper_BET

```xpp
public static class ContextHelper_BET
{
    public static IContextContract_BET getContractInstance(ClassName _className)
    {
        IContextContract_BET contract;

        ClassId classId = className2Id(_className);

        ContextContractRegistry_BET registry = ContextContractRegistry_BET::instance();
        if (registry.exists(classId))
        {
            contract = registry.lookup(classId);
        }
        
        return contract;
    }

    public static IContextContract_BET createContractInstance(ClassName _className)
    {
        return SysExtensionAppClassFactory::getClassFromSysAttribute(
            classStr(IContextContract_BET),
            new ContextContractFactoryAttribute_BET(_className)
        ) as IContextContract_BET;
    }
}
```

#### IContextContract_BET

```xpp
public abstract class IContextContract_BET implements System.IDisposable
{
    protected void new()
    {
        this.registry().insert(this);
    }

    public void dispose()
    {
        ClassId classId = classIdGet(this);

        if (this.registry().exists(classId))
        {
            this.registry().remove(classId);
        }

        this.registry().dispose();
    }

    private ContextContractRegistry_BET registry()
    {
        return ContextContractRegistry_BET::instance();
    }
}
```

### Example: Timesheet Cost Price Modification

Let’s now apply the new framework to the same timesheet cost price scenario. You want to extend the `TSTimesheetTrans.setCostPrice` method to allow zero cost price during a specific workflow.

#### Step 1: Create the Contract Class

Define a contract class that will hold the custom context (e.g., whether to allow zero cost price):

```xpp
internal final class TSTimesheetLineValidateSubmitContract_BET extends IContextContract_BET
{
    public boolean allowZeroCostPrice;

    public boolean parmAllowZeroCostPrice(boolean _allowZeroCostPrice = allowZeroCostPrice)
    {
        allowZeroCostPrice = _allowZeroCostPrice;
        return allowZeroCostPrice;
    }

    protected void new() 
    {
        super();
    }

    public static TSTimesheetLineValidateSubmitContract_BET construct()
    {
        return new TSTimesheetLineValidateSubmitContract_BET();
    }
}
```

#### Step 2: Modify the `validateSubmit` Method

Extend the `validateSubmit` method in `TSTimesheetLine` to use the new **ContextHelper_BET** framework:

```xpp
[ExtensionOf(tableStr(TSTimesheetLine))]
final class TSTimesheetLine_Extension
{
    public boolean validateSubmit(boolean _showInfolog, boolean _deleteZeroHourLines)
    {
        boolean validateSubmit;

        using (TSTimesheetLineValidateSubmitContract_BET contract = ContextHelper_BET::createContractInstance(classStr(TSTimesheetLineValidateSubmitContract_BET)))
        {
            contract.parmAllowZeroCostPrice(true);

            validateSubmit = next validateSubmit(_showInfolog, _deleteZeroHourLines);
        }

        return validateSubmit;
    }
}
```

#### Step 3: Modify the `setCostPrice` Method

Finally, extend the `setCostPrice` method in `TSTimesheetTrans` to check the contract and set the cost price to zero if applicable:

```xpp
[ExtensionOf(tableStr(TSTimesheetTrans))]
final class TSTimesheetTransTable_Extension
{
    public void setCostPrice(TSTimesheetLine _timesheetLine)
    {
        boolean origCostPriceIsZero = this.CostPrice == 0;

        next setCostPrice(_timesheetLine);

        if (origCostPriceIsZero)
        {
            TSTimesheetLineValidateSubmitContract_BET contract = ContextHelper_BET::getContractInstance(classStr(TSTimesheetLineValidateSubmitContract_BET));

            if (contract && contract.parmAllowZeroCostPrice())
            {
                this.CostPrice = 0;
            }
        }
    }
}
```

### Summary

The new **ContextHelper_BET** framework simplifies the handling of contextual data within Chain of Command scenarios by using a contract registry and a factory to manage the lifecycle of context objects. It is more flexible and scalable than the previous implementation, allowing you to easily extend methods while maintaining the integrity of the call stack.

This framework is ideal for complex extensions where non-extensible objects or methods interrupt the flow of contextual data. However, as always, use this approach judiciously to avoid unnecessary complexity in your codebase.
