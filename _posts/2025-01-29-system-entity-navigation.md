---
title: 'Navigating Dynamics 365 F&O with System Entity Navigation'
categories: X++
tags: X++
---

# Navigating Dynamics 365 Finance and Operations with System Entity Navigation

In Dynamics 365 Finance and Operations (D365 F&O), a deep link takes the user straight to a specific record. That is usually done with [deep link generation](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/user-interface/create-deep-links). Microsoft also ships **System Entity Navigation**, which makes the same job simpler.

## Understanding System Entity Navigation

With System Entity Navigation you build a URL that opens a specific record in D365 F&O. The URL carries the entity name and a GUID that identifies the record. Opening it lands the user on the form for that record.

Microsoft documents the feature under [System Entity Navigation](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/user-interface/create-deep-links#system-entity-navigation).

## The Role of GUIDs in System Entity Navigation

The GUID is what identifies the record. In D365 F&O it is built from the record's `TableId` and `RecId`: the two values are copied, as bytes, into one 16-byte GUID.

The following X++ methods illustrate how to generate and interpret these GUIDs:

```xpp
// Generate a GUID from TableId and RecId
System.Guid getGuidFromTableIdRecId(TableId _tableId, RecId _recId)
{
    System.Byte[] recidBytes = System.BitConverter::GetBytes(_recId);
    System.Byte[] tableIdBytes = System.BitConverter::GetBytes(_tableId);
    int padValue = 0;
    System.Byte[] padBytes = System.BitConverter::GetBytes(padValue);
    System.Byte[] guidBytes = new System.Byte[16]();
    System.Buffer::BlockCopy(tableIdBytes, 0, guidBytes, 0, 4);
    System.Buffer::BlockCopy(padBytes, 0, guidBytes, 4, 4);
    System.Buffer::BlockCopy(recidBytes, 0, guidBytes, 8, 8);
    System.Guid recIdGuid = new System.Guid(guidBytes);

    return recIdGuid;
}
```

```xpp
// Extract TableId and RecId from a GUID
container getTableIdRecIdFromGuid(System.Guid _recIdGuid)
{
    TableId tableId;
    RecId recId;
    System.Byte[] guidBytes = _recIdGuid.ToByteArray();
    tableId = System.BitConverter::ToInt32(guidBytes, 0);
    recId = System.BitConverter::ToInt64(guidBytes, 8);

    return [tableId, recId];
}
```

Both methods live on `CDSVirtualEntityConverter`. They show how the GUIDs used by System Entity Navigation are encoded and decoded.

## Integrating System Entity Navigation with Custom Link Handlers

In a previous post I replaced deep links with a `LinkHandler` class that reads URL parameters, finds the record, and redirects to it. More on that approach [here](https://raphaelbucher.ch/x++/2024/09/13/deeplink-alternative-linkhandler.html).

Once you know how the GUID is built, the handler can take that GUID instead of `tableName` and `searchKey`, and read `TableId` and `RecId` back out of it. That drops the extra parameters.

## Conclusion

System Entity Navigation is a solid way to deep-link inside D365 F&O. The GUID already carries `TableId` and `RecId`, so navigation code stays smaller and easier to maintain. Pairing that with a custom link handler is a clean way to send a user to a specific record.

