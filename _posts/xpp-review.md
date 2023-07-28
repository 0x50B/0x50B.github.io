## Current state of X++ programming
X++ has previously (pre D365) been more of a "scripting" language, as the code was not compiled to an intermediate language.
Thus, the programming speed was super fast. You could have written some code and directly execute it, without even compiling it first.
In AX2012, there was already a hint, that there will be a change, since the server code was indeed compiled first to CIL, before it could be executed.
You could even change production code in a blink / hotfix style (which obvisously is (and was) not good practice).

## Downtime
Nowadays, X++ in DFO is completely in CIL. Programming speed has since degraded by a lot. Every change has to be compiled first.
There are certain mechanics, so that the compilation time is reduced. For instance, a change in a model only requires the model to be recompiled.
Even a partial compile is possible, so that only the delta to certain objects of a model are compiled.

Still, the downtime a compilation causes during development is too high. No hotswap of compilated DLLs is possible, thus all services will be shutdown before a Models DLLs can be replaced.
The service downtime adds some precious seconds to minutes, thats just annoying to bear with as a developer.

Note: downtime can be drasitcally reduced if you use unit tests - these are executed faster than if you wait for the UI to be back after a compilation.

## Language
The language 'elements' of X++ are old, compared to other modern programming languages. Its like X++ has been stuck in 2000.
For instance, you are not able to loop list/array elements other than with an arbitary for loop or a dedicated object iterator/enumerator.
X++ resembles C# alot, but lacks all the new stuff that makes a developers life easier. 
Just some examples, that i miss the most:

- [foreach](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/iteration-statements#the-foreach-statement) not supported
- no [ternary shortcuts/null coalescing operations](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/null-coalescing-operator) (x ? x : y -> x ?? y)
- no [generic type parameters](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/generics/generic-type-parameters)
- no [async/await](https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-scenarios) capabilites
- ...

## Debugging
As of now, Visual Studio 2019 is the current IDE version to develop X++. Visual Studio 2019 is still a 32bit Software, 
that combined with the huge size of debugging symbols that have to be loaded for debugging X++ code, which cannot be addressed by 32bit, will result in frustrating crashes every now and then.
Even though the modules that should be loaded during debugging can now be configured, the debugging experience is still abysmal and resulting in constant crashes.
The only remedey after some time of ongoing debugging is by deleting all breakpoints set and restarting visual studio.

Also, you cannot add variables to the watch list that are member of a chain of command class. 
Generally the debugger has its problems with chain of command classes, there is no context of 'this' accessible.
