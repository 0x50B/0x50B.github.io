---
title: "Using DebuggerDisplayAttribute in X++ to enhance debugging"
date: 2025-02-17
description: "Learn how to use the DebuggerDisplayAttribute in X++ to improve the debugging experience by customizing object representations."
tags: [X++, Debugging]
---

## Debugging in X++ with DebuggerDisplayAttribute

When debugging in Microsoft Dynamics 365 Finance & Operations (F&O), objects in the debugger can be hard to read. By default you only see the full type name, which often tells you very little. `DebuggerDisplayAttribute` lets you choose what is shown instead.

### What is DebuggerDisplayAttribute?

`DebuggerDisplayAttribute` is a .NET attribute. It defines the string a debugger shows for an object. It is common in C#, and it works on X++ classes as well, because they run on the .NET runtime.

### Example in X++

Here is a class decorated with `DebuggerDisplayAttribute`:

```xpp
[System.Diagnostics.DebuggerDisplayAttribute("{toString()}")]
public final class DebuggerDisplayTest_BEC
{
    public str toString()
    {
        return 'Hello World!';
    }
}
```

### How It Works

1. `[System.Diagnostics.DebuggerDisplayAttribute("{toString()}")]` tells the debugger to show the result of `toString()` when you inspect a `DebuggerDisplayTest_BEC` instance.
2. `toString()` returns a readable description of the object.
3. While debugging, you see `Hello World!` in this example instead of only the class name, so it is obvious what the object represents.

### Why Use DebuggerDisplayAttribute?

- **Easier to read**: You can identify an object and its state at a glance.
- **Faster debugging**: You do not have to expand properties just to see the interesting values.
- **Easier to maintain**: Helpful when a team is debugging deep object graphs.

### Final Thoughts

`DebuggerDisplayAttribute` is a small change that makes X++ debugging much easier to follow. On a complex object, you see the useful information immediately.

Have you used `DebuggerDisplayAttribute` in your X++ development? Let me know in the comments.
