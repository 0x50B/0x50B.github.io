---
title: "Overwriting System Fields in Dynamics 365 F&O: Data Migration Made Easier"
date: 2025-02-13
description: "Learn how to overwrite system fields in Dynamics 365 F&O, enabling you to maintain original timestamps and metadata during data migration."
tags: [X++, Data Migration]
---

## Overwriting System Fields in Dynamics 365 F&O

In some data migrations you need to keep the original record metadata, such as `CreatedDateTime`, instead of the timestamps the system would generate. System fields are protected from direct changes, but X++ can override that with `overwriteSystemfields(true)`.

### Why Overwrite System Fields?
When you import historical data from a legacy system, it is often important to preserve:
- **Original creation timestamps** (`CreatedDateTime`)
- **Modified timestamps** (`ModifiedDateTime`)
- **User IDs** of the people who created or modified the records

Without that, newly inserted records get system-generated values, and reporting or auditing can end up inconsistent.

### How to Overwrite System Fields in X++
The following X++ example sets system fields while inserting into the `HcmWorkerActionCommentHistoryEntity` entity:

```axapta
public class HcmWorkerActionCommentHistoryEntity extends common
{
    public boolean insertEntityDataSource(DataEntityRuntimeContext _entityCtx, DataEntityDataSourceRuntimeContext _dataSourceCtx)
    {
        boolean ret = true;

        if (_dataSourceCtx.name() == dataentitydatasourcestr(HcmWorkerActionCommentHistoryEntity, HcmWorkerActionComment))
        {
            HcmWorkerActionComment workerActionComment;

            workerActionComment = _dataSourceCtx.getBuffer();

            // Enable overwriting system fields
            workerActionComment.overwriteSystemfields(true);
            
            // Preserve original CreatedDateTime
            workerActionComment.(fieldNum(HcmWorkerActionComment, CreatedDateTime)) = this.CommentCreationTime;

            workerActionComment.doInsert();
            _dataSourceCtx.setDataSaved(true);

            this.mapDataSourceToEntity(_entityCtx, _dataSourceCtx);
        }
        else
        {
            ret = super(_entityCtx, _dataSourceCtx);
        }

        return ret;
    }
}
```

### Explanation
1. **Check the data source**: The method continues only when the current data source is `HcmWorkerActionComment`.
2. **Allow system fields to be overwritten**: `overwriteSystemfields(true);` makes those fields writable.
3. **Assign the original timestamp**: `CreatedDateTime` is set to `this.CommentCreationTime`.
4. **Insert the record directly**: `doInsert();` writes the record with those values.

### Considerations
- Keep overwriting system fields **tightly controlled**, and use it only for migrations or other special cases.
- Make sure the values you assign are valid and match the business rules.
- This **bypasses system defaults**, so think about compliance and audit requirements before you use it.

### Conclusion
`overwriteSystemfields(true)` lets you keep historical timestamps and metadata intact during a migration, so the data in Dynamics 365 Finance & Operations still reflects when the records were really created and changed.

Have you used this approach in your projects? Let me know in the comments!
