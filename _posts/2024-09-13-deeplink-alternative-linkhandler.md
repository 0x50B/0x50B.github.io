---
layout: post
title: "Replacing Deep Links with a LinkHandler Class in Dynamics 365"
date: 2024-09-13
categories: [X++]
tags: [X++]
---

# Replacing Deep Links with a LinkHandler Class in Dynamics 365

In Dynamics 365 development, deep links are often used to direct users to specific records within the system. However, deep links can be fragile, especially when the underlying data changes or when they include complex URL parameters. To address this, we can implement a `LinkHandler` class that processes URL parameters, searches for the specified record, and automatically redirects the user to the appropriate form.

In this post, I’ll walk through an example of how to replace deep links with a `LinkHandler_BEC` class.

## The Concept Behind LinkHandler

The `LinkHandler_BEC` class serves as a more dynamic and maintainable alternative to deep links. It takes URL parameters—such as a table name and a search key—and attempts to locate the corresponding record. Once the record is found, it redirects the user to the relevant form.

This method is more flexible than traditional deep links because it decouples the URL structure from specific record identifiers, making the system more resilient to changes.

### Key Features of the LinkHandler Approach

- **Dynamic Record Search**: The handler uses the table name and search key passed in the URL to query for the correct record.
- **Error Handling**: If no record is found, the user is alerted with a meaningful error message.
- **Automatic Redirection**: Once the record is found, the handler redirects the user to the appropriate UI form.
- **Security Compliance**: Before redirection, the handler ensures that the user has the necessary permissions to view the record.

## Code Example: `LinkHandler_BEC`

Below is the X++ implementation of the `LinkHandler_BEC` class.

```xpp
internal final class LinkHandler_BEC
{
    private TableName tableName;
    private container searchKey;
    private Common common;

    public static LinkHandler_BEC construct()
    {
        return new LinkHandler_BEC();
    }

    public static void main(Args _args)
    {
        var linkHandler = LinkHandler_BEC::construct();
        linkHandler.initFromUrl();
        linkHandler.redirect();
    }

    private void initFromUrl()
    {
        URLUtility urlUtility = new URLUtility();

        tableName = urlUtility.getQueryParamValue('tableName');
        searchKey = str2con(urlUtility.getQueryParamValue('searchKey'), ';');
    }

    private Common fetchRecord()
    {
        SysDictTable entityDictTable = SysDictTable::newName(tableName);
        common = entityDictTable.makeRecord();

        var searchObject = this.getSearchObject(common);
        var searchStatement = new SysDaSearchStatement();

        if (!searchStatement.findNext(searchObject))
        {
            throw error('No record found.');
        }

        return common;
    }

    private SysDaSearchObject getSearchObject(Common _common)
    {
        var queryObject = new SysDaQueryObject(_common);
        SysDaEqualsExpression equalsExpression;

        for (int i = 1; i <= conLen(searchKey); i++)
        {
            str keyValue = conPeek(searchKey, 1);
            str fieldName, value;
            [fieldName, value] = str2con(keyValue, ':');

            SysDictField dictField = SysDictField::newName(tableId2Name(_common.TableId), fieldName);

            if (!dictField)
            {
                throw error(strFmt('Unknown field %1', fieldName));
            }

            anytype searchValue = this.getSearchFieldValue(value, dictField);

            if (!equalsExpression)
            {
                equalsExpression = new SysDaEqualsExpression(
                    new SysDaFieldExpression(_common, fieldName),
                    new SysDaValueExpression(searchValue)
                );
            }
            else
            {
                equalsExpression.and(
                    new SysDaEqualsExpression(
                        new SysDaFieldExpression(_common, fieldName),
                        new SysDaValueExpression(searchValue)
                    )
                );
            }
        }

        if (equalsExpression)
        {
            queryObject.whereClause(equalsExpression);
        }

        queryObject.firstOnlyHint = SysDaFirstOnlyHint::FirstOnly1;
        return new SysDaSearchObject(queryObject);
    }

    private anytype getSearchFieldValue(anytype _value, SysDictField _dictField)
    {
        Types type = _dictField.baseType();

        switch (type)
        {
            case Types::RString:
            case Types::VarString:
            case Types::String:
                return any2Str(_value);
            case Types::Integer:
                return any2Int(_value);
            case Types::Int64:
                return any2Int64(_value);
            case Types::Real:
                return any2Real(_value);
            case Types::Date:
                return any2Date(_value);
            case Types::Enum:
                return new SysDictEnum(_dictField.enumId()).name2Value(_value);
            case Types::Guid:
                return any2Guid(_value);
            case Types::UtcDateTime:
                return DateTimeUtil::parse(_value);
            default:
                throw error(strfmt("@SYS73815", type));
        }
        return null;
    }

    private void redirect()
    {
        SysDictTable entityDictTable = SysDictTable::newName(tableName);
        Common record = this.fetchRecord();

        var accessRights = SecurityRights::construct().tableAccessRight(entityDictTable.name(), record);

        if (accessRights == AccessRight::NoAccess)
        {
            throw error('Insufficient rights to access record');
        }

        Args args = new Args(entityDictTable.formRef());
        args.record(record);

        FormRun formRun = classfactory.formRunClass(args);
        formRun.init();
        formRun.run();
        formRun.detach();
    }
}
```
