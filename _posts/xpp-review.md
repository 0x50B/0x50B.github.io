## Current state review of X++ programming
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

## Language
The language 'elements' of X++ are old, compared to all the other languages. Its like X++ has been stuck in 2000.
For instance, you are not able to loop list/array elements other than with an arbitary for loop or a dedicated object iterator/enumerator.
X++ resembles C# alot, but lacks all the new stuff that makes a developers life easier. 
Just some examples:

- foreach not supported
- no ternary shortcuts (x ? x : y -> x ?? y)
- 
