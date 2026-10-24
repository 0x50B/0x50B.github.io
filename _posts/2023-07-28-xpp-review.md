---
categories: X++
tags: X++
description: "Where X++ stands in Dynamics 365: longer compiles, missing language features, and a debugger that still crashes too often."
---
## Current State of X++ Programming
X++ has changed a lot over the years, especially with Dynamics 365 (D365). It used to be closer to a scripting language: it was not compiled to an intermediate language. That made development super fast. You wrote code and ran it immediately, with no compile step. AX 2012 already hinted at what was coming, because server code had to be compiled to CIL (Common Intermediate Language) before it could run. Hotfix-style changes were still possible, but they were not good practice.

## Downtime
Today, X++ in D365 runs entirely as CIL, and development is noticeably slower. Every change has to be compiled first. A few mechanisms keep the wait down, such as recompiling only the model you changed, or compiling individual objects in that model.

Even so, compile time during development is still a real problem. There is no hot-swap of compiled DLLs, so the service has to shut down before the model DLLs can be replaced. That can cost anywhere from a few seconds to several minutes, which is frustrating in the middle of a change.

Unit tests help a lot here. They finish faster than waiting for the UI to come back after every compilation.

## Language
Next to modern languages, X++ is showing its age. It still feels stuck in the 2000s, and it lacks conveniences developers now take for granted. For example:

- It does not support the [foreach](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/iteration-statements#the-foreach-statement) loop that C# has.
- There is no [null-coalescing operator](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/null-coalescing-operator), so you cannot write `x ?? y` instead of `x ? x : y`.
- [Generic type parameters](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/generics/generic-type-parameters), which make code more flexible, are missing.
- [async/await](https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-scenarios), which simplifies asynchronous code, is not available.

These gaps make X++ harder to work with, especially if you are used to a newer language.

## Debugging
Visual Studio 2019 is still the primary IDE for X++. It is a 32-bit application, and the debugging symbols for X++ are large, so the debugger crashes more often than it should. You can now choose which modules are loaded while debugging, but the experience is still poor and crashes remain common. The usual recovery is to delete every breakpoint and restart Visual Studio in the middle of a session.

Debugging Chain of Command classes is awkward as well. There is no usable `this` context, and variables that belong to those classes cannot be added to the watch window.

## Conclusion
After 13 years of X++, I have to admit that the limits of the language and the debugging problems have been quite a journey. I still like what X++ does well, especially the ORM: `select` statements on data objects are hard to give up.

Asking new developers to learn this language, and to live with its limits, puts people off. Why learn X++ when other languages are more convenient?

I still catch myself wishing for a successor, let's call it X#, that keeps the strengths of X++ and adds the newer parts of C#. That would make day-to-day work much more pleasant without throwing away what makes X++ useful.

I can only imagine how much work it is for Microsoft to keep maintaining and improving X++, given its age and how narrow its field of use is.
