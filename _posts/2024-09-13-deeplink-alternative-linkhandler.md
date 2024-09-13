---
layout: post
title: "Replacing Deep Links with a LinkHandler Class in Dynamics 365"
date: 2024-09-13
categories: [X++]
tags: [X++]
---

# Replacing Deep Links with a LinkHandler Class in Dynamics 365

In Dynamics 365 development, deep links are often used to direct users to specific records within the system. However, deep links can be fragile, especially when the underlying data changes or when they include complex URL parameters. To address this, we can implement a `LinkHandler` class that processes URL parameters, searches for the specified record, and automatically redirects the user to the appropriate form.

In this post, I’ll walk through an example of how to replace deep links with a `LinkHandler` class.

## The Concept Behind LinkHandler

The `LinkHandler` class serves as a more dynamic and maintainable alternative to deep links. It takes URL parameters—such as a table name and a search key—and attempts to locate the corresponding record. Once the record is found, it redirects the user to the relevant form.

This method is more flexible than traditional deep links because it decouples the URL structure from specific record identifiers, making the system more resilient to changes.

### Key Features of the LinkHandler Approach

- **Dynamic Record Search**: The handler uses the table name and search key passed in the URL to query for the correct record.
- **Error Handling**: If no record is found, the user is alerted with a meaningful error message.
- **Automatic Redirection**: Once the record is found, the handler redirects the user to the appropriate UI form.
- **Security Compliance**: Before redirection, the handler ensures that the user has the necessary permissions to view the record.

### Building the URL for the LinkHandler

To use the `LinkHandler` class, you’ll need to construct the URL with the appropriate query parameters. Below is the template format and a real usage example. Note that an appropriate MenuItemAction should be created and secured through a priviliege.

#### URL Template
&mi=action:LinkHandler&tableName=[TableName]&searchKey=[Field1:Value1];[Field2:Value2];[...]
- `tableName`: The name of the table you want to search.
- `searchKey`: A semicolon-separated list of field-value pairs used to locate the record.

#### Real Usage Example
&mi=action:LinkHandler&tableName=ProjTable&searchKey=ProjId:PRJ-000032

In this example, the `LinkHandler` searches the `ProjTable` for a record where the `ProjId` is `PRJ-000032`.

## Code Example: `LinkHandler`

Below is the X++ implementation of the `LinkHandler` class.

```xpp
internal final class LinkHandler
{
    private TableName tableName;
    private container searchKey;
    private Common common;

    public static LinkHandler construct()
    {
        return new LinkHandler();
    }

    public static void main(Args _args)
    {
        var linkHandler = LinkHandler::construct();
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

### Optimizing URL Parameters with Standardization

While the current `LinkHandler` URL structure works, we can take inspiration from the OData protocol to make the URL parameters more standardized and readable. By following a convention similar to OData query syntax, we can make the URLs more intuitive and easier to parse.

#### OData-Inspired URL Structure

In OData, query parameters are standardized, allowing for more flexibility and clarity when querying data. For instance, we can use parameter names like `$filter` to specify conditions in a consistent way. Here's how we could apply this approach to our `LinkHandler` class:

#### Optimized URL Template
&$table=TableName&$filter=Field1 eq 'Value1' and Field2 eq 'Value2'

- `$table`: Specifies the table to search.
- `$filter`: Defines the conditions for locating the record, similar to OData filters. Using `eq` (equals) allows for better clarity and alignment with standard query syntax.

#### Real Usage Example
&$table=ProjTable&$filter=ProjId eq 'PRJ-000032'

In this example, we search the `ProjTable` for a record where `ProjId` equals `PRJ-000032`. The use of `$filter` allows for potential expansion in the future, such as supporting other operators (`ne` for "not equal," `gt` for "greater than," etc.).

#### Benefits of Standardization

1. **Clarity**: The URL becomes more readable and easier to understand for both developers and administrators.
2. **Flexibility**: By using a standardized format, we can expand the logic to support more complex queries in the future without breaking existing URLs.
3. **Maintainability**: Standardized URLs are easier to maintain as they follow a known convention, reducing the risk of errors.

Standardizing the URL parameters not only aligns with best practices but also makes the solution scalable and easier to integrate with other parts of the system.
But since this was more of a proof of concept, I decided to just use an easier approach to implement the URL parameter handling.
