---
title: "Get selected record from SysTableLookup"
date: 2025-10-02
tags: [X++, Interpreter]
---

## How to get the record from a lookup dialog in X++
Sometimes, when you build a lookup, you might have to further use the selected record of a lookup. For instance, a returned lookup value might not be unique and you need to further process what the user really selected.
For this, i created an extension for the SysTableLookup class which registers an event handler to the lookups form closing. When the user selects a value from the lookup, the selected record of the root datasource will be passed on to the delegate.
For the use in form extensions, you may also just set what form method you would like to notify of what record has been selected, because in form extensions you are not allowed to register an eventhandler.


```xpp
[ExtensionOf(classstr(SysTableLookup))]
final class SysTableLookupClass_BEC_Extension
{
    private SysTableLookupHandler_BEC sysTableLookupHandler_BEC;

    public SysTableLookupHandler_BEC parmSysTableLookupHandler_BEC(SysTableLookupHandler_BEC _sysTableLookupHandler_BEC = sysTableLookupHandler_BEC)
    {
        sysTableLookupHandler_BEC = _sysTableLookupHandler_BEC;
        return sysTableLookupHandler_BEC;
    }

    protected FormRun formRun()
    {
        FormRun formRun_BEC = next formRun();

        if (sysTableLookupHandler_BEC)
        {
            formRun_BEC.OnClosing += eventhandler(this.onClosing_BEC);
        }

        return formRun_BEC;
    }

    private void onClosing_BEC(xFormRun _sender, FormEventArgs _eventArgs)
    {
        if (_sender.closedOk() && sysTableLookupHandler_BEC)
        {
            sysTableLookupHandler_BEC.invokeOnLookupRecordSelected_BEC(
                _sender.dataSource(1).cursor()
            );
        }
    }

}
```

The handler will be instantiated in your form or form extension and will be passed on the SysTableLookup class.
This will act as a bridge between your form or form extension, and the SysTableLookup class.

```xpp
public class SysTableLookupHandler_BEC
{
    FormRun formRun;
    MethodName formMethod;

    delegate void onLookupRecordSelected_BEC(Common _common) { }

    protected void new() { }

    public static SysTableLookupHandler_BEC construct()
    {
        return new SysTableLookupHandler_BEC();
    }

    public void invokeOnLookupRecordSelected_BEC(Common _common)
    {
        if (formRun && formMethod)
        {
            new DictClass(classIdGet(formRun))
                .callObject(formMethod, formRun, _common);
         
            return;
        }

        this.onLookupRecordSelected_BEC(_common);
    }

    public void setObjectMethodToInvoke(FormRun _formRun, MethodName _formMethod)
    {
        formRun = _formRun;
        formMethod = _formMethod;
    }

}
```

Inside the lookup method of your control, you use the SysTableLookup class as you normally would, but now you may set the SysTableLookupHandler to be able to get notified of what record the user selected:

```xpp
SysTableLookup sysTableLookup_BEC = SysTableLookup::newParameters(tableNum(Table), _formStringControl);

Query query_BEC = new Query();
QueryBuildDataSource tableQBDS = query_BEC.addDataSource(tableNum(Table));

tableQBDS
    .addRange(fieldNum(Table, Field))
    .value(queryValue('value'));

SysTableLookupHandler_BEC tableLookupHandler_BEC = SysTableLookupHandler_BEC::construct();
sysTableLookup_BEC.parmSysTableLookupHandler_BEC(tableLookupHandler_BEC);

// either for form extensions:
sysTableLookup_BEC.setObjectMethodToInvoke(this, methodStr(Form_BEC_Extension, sysTableLookupHandler_onLookupRecordSelected_BEC));

// or for your own forms, if you want to use eventhandlers:
tableLookupHandler_BEC.onLookupRecordSelected += eventHandler(this.sysTableLookupHandler_onLookupRecordSelected_BEC);

sysTableLookup_BEC.parmQuery(query_BEC);
sysTableLookup_BEC.addLookupfield(fieldNum(Table, Field1), true);
sysTableLookup_BEC.addLookupfield(fieldNum(Table, Field2));
sysTableLookup_BEC.performFormLookup();
```

In your form extension class
```xpp
public void sysTableLookupHandler_onLookupRecordSelected_BEC(Common _common)
{
    if (_common.TableId != tableNum(Table))
    {
        return;
    }

    // do what ever
}  
```



