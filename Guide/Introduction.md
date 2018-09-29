# 简介

**我想理解React是如何工作的**

所有的一切开始于这个想法。直接阅读 React 源码是一件痛苦的事情，一方面源码包含了错误处理，性能分析（Profiler API），
服务器端渲染等等我不关心的功能，另一方面源码把所有的细节都呈现出来，而这对从来没有深入过 React 源码的我来说过于复杂。

**那么，通过什么方法来理解React呢？**

写一个简单的Renderer，替换掉 ReactDom Renderer，用这个 Renderer 渲染一个简单的组件来调试实现时间分片的ReactReconciler 模块。

通过一些前提假设来简化 ReactReconciler 模块的代码，用简化版的代码替换掉原来的代码，再来调试 Suspense 等模块的代码

所以，通过一步一步地把 React 各个模块的源码替换成简化的代码，来完成一个我所理解的 SimpleReact。

**结果**

最后完成的 simpleReact 仍然有一千多行的代码，但是复杂度已经降低到我能理解的程度。
保留的主要功能有 time slicing（当然啦。。。），suspense，事件处理，组件生命周期函数。

**注意**
SimpleReact是对 React v16.4.2 的简化，它的目的是为了理解 React 的主要原理，它并不能像 React 一样完成所有的工作。
我只能确保它在一些情况下能够如我预期一样的运行。

[开始吧](CustomRenderer.md)
