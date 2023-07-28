## Current State of X++ Programming
X++ programming has evolved over the years, especially with the introduction of Dynamics 365 (D365). In the past, X++ was more of a "scripting" language, lacking compilation to an intermediate language. This allowed for super-fast programming, where you could write code and directly execute it without prior compilation. However, with AX2012, a change was already hinted at, as the server code needed to be compiled to CIL (Common Intermediate Language) before execution. Even though hotfix-style changes were possible, it wasn't considered a good practice.

## Downtime
In the present day, X++ in D365 operates entirely in CIL, causing a noticeable slowdown in programming speed. Every change now requires compilation first. To mitigate the downtime, there are certain mechanisms in place, such as recompiling only the model affected by the change or performing partial compilations for specific model objects.

However, despite these efforts, the downtime caused by compilation during development remains a significant issue. There's no hotswap of compiled DLLs, resulting in service shutdowns before replacing Model DLLs. This can add precious seconds to minutes of downtime, which can be frustrating for developers.

It's worth noting that leveraging unit tests can dramatically reduce downtime, as they execute faster than waiting for the UI to be available after each compilation.

## Language
X++ is showing its age when compared to modern programming languages. It seems stuck in the 2000s, lacking some of the convenient features that developers have come to expect. For example:

- It doesn't support the convenient [foreach](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/iteration-statements#the-foreach-statement) loop found in C#.
- Ternary shortcuts or [null coalescing operations](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/null-coalescing-operator), like x ? x : y -> x ?? y, are not available in X++.
- [Generic type parameters](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/generics/generic-type-parameters), essential for code flexibility, are missing.
- The powerful [async/await](https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-scenarios) capabilities, which streamline asynchronous programming, are absent.

These limitations make it challenging for developers, especially those familiar with newer languages, to work efficiently with X++.

## Debugging
Currently, Visual Studio 2019 is the primary IDE for X++ development. However, it is a 32-bit software, and when combined with the large debugging symbols required for X++ code, it can lead to frustrating crashes. Although you can now configure the modules to be loaded during debugging, the experience is still far from ideal and often results in constant crashes. To alleviate this, developers often have to delete all breakpoints and restart Visual Studio during ongoing debugging sessions.

Additionally, debugging chain of command classes poses issues, as there is no accessible context of 'this,' and variables belonging to these classes cannot be added to the watch list.

## Conclusion
As a seasoned X++ developer with 13 years of experience, I must admit that the language's limitations and debugging challenges have been quite the journey. Despite the pain, I find myself drawn to the unique capabilities of X++, especially its ORM capabilities using select statements on data objects.

Also, expecting new developer to learn this language and it's limitation, is kind of a deterrence for fresh programmers. Why would one want to learn this programming language, when there are better and more convenient languages?

However, I can't help but dream of a new language, let's call it X#, which combines the latest features of C# with the strengths of X++. Such a language would undoubtedly bring a new level of convenience and efficiency to X++ development while preserving its special qualities.

I can only imagine how hard it must be for Microsoft to still maintain and further optimize X++, despite its age and limited operation area.
