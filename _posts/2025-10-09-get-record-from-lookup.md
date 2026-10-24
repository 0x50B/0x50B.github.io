---
title: "Get selected record from SysTableLookup"
date: 2025-10-02
tags: [X++]
---

## How to get the record from a lookup dialog in X++
Sometimes the value a lookup returns is not enough. It may not be unique, and you need the record the user actually selected.
I extended `SysTableLookup` so it subscribes to the lookup form's closing event. When the user picks a value, the selected record of the root data source is passed to a delegate.
Form extensions cannot register an event handler, so you can instead name the form method that should be called with the selected record.


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

Create the handler on your form, or form extension, and pass it to `SysTableLookup`.
It is the bridge between the form and `SysTableLookup`.

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

In the control's lookup method, use `SysTableLookup` as usual, and set the handler so you are told which record the user selected:

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

In your form extension class:
```xpp
public void sysTableLookupHandler_onLookupRecordSelected_BEC(Common _common)
{
    if (_common.TableId != tableNum(Table))
    {
        return;
    }

    // do whatever you need with the selected record
}  
```



