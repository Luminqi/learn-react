# Fiber 架构

## 为什么需要 Fiber ?

在 Fiber 之前，[Stack Reconciler](https://reactjs.org/docs/implementation-notes.html) 负责完成组件的渲染。简单的说， 一旦我们调用 ReactDOM.render 来进行第一次组件挂载， 或是用户交互触发了 this.setState 更新过程，整个挂载或者更新过程不可能被打断。

因为 Stack Reconciler 就如它的名字一样， 它从根组件开始，递归地调用各个组件的 render 函数来明确渲染什么。整个计算过程是由 javascript stack 控制的，而我们无法控制js栈。

如果计算量庞大，会阻塞浏览器的渲染过程造成卡顿，用户的交互也无法得到实时的反馈。而 Fiber 架构能够解决这些问题。

## 什么是 Fiber ？

社区已经有很多介绍 Fiber 的资料，我首推 [fresh-async-react](https://github.com/sw-yx/fresh-async-react)。 这个项目涵盖了目前为止关于 React 的各种官方和社区的资料，并且在不断更新中。

为了理解 Fiber 架构，我觉得这几个视频有必要重点看一下：
* [Beyond React 16 ](https://www.youtube.com/watch?v=v6iR3Zk4oDY)
* [Lin Clark's A Cartoon Intro to Fiber](https://www.youtube.com/watch?v=ZCuYPiUIONs)
* [Algebraic Effects, Fibers, Coroutines](https://www.youtube.com/watch?v=7GcrT0SBSnI)

最后一个视频非常有用，它让我对 Fiber 为什么被设计成这样，time slicing 和 suspense 是如何实现的有了一个概观。

之前 React 在挂载和更新过程中，本质上就是在调用函数，而函数的执行是由 javascript call stack 控制的，stack frame 则代表了函数的调用。stack frame 的创建销毁都是由 js 引擎完成的，我们不能在程序中使用它。

![stackFrame](Images/Fiber_StackFrame.PNG)

整个Fiber 架构可以看作实现了一个类似于 javascript call stack 的 React call stack，而具体的单个 fiber 实例可以看作是一个包含了组件信息的 stack frame。 而现在这个call stack是我们能够完全控制的，我们可以创建，删除，复制 stack frame。

就像一个 stack frame 包含了指向当前函数的指针，函数的返回地址，函数参数，临时变量等等，一个 fiber 实例包含了当前的组件信息，父组件 fiber，props， state 等等。

现在，让我们看看真正的 fiber 是什么样子：
```javascript
// A Fiber is work on a Component that needs to be done or was done. There can
// be more than one per component.
type Fiber = {|
  // Tag identifying the type of fiber.
  tag: WorkTag,

  // Unique identifier of this child.
  key: null | string,

  // The function/class/module associated with this fiber.
  type: any,

  // The local state associated with this fiber.
  stateNode: any,

  // Conceptual aliases
  // parent : Instance -> return The parent happens to be the same as the
  // return fiber since we've merged the fiber and instance.

  // Remaining fields belong to Fiber

  // The Fiber to return to after finishing processing this one.
  // This is effectively the parent, but there can be multiple parents (two)
  // so this is only the parent of the thing we're currently processing.
  // It is conceptually the same as the return address of a stack frame.
  return: Fiber | null,

  // Singly Linked List Tree Structure.
  child: Fiber | null,
  sibling: Fiber | null,
  index: number,

  // The ref last used to attach this node.
  // I'll avoid adding an owner field for prod and model that as functions.
  ref: null | (((handle: mixed) => void) & {_stringRef: ?string}) | RefObject,

  // Input is the data coming into process this fiber. Arguments. Props.
  pendingProps: any, // This type will be more specific once we overload the tag.
  memoizedProps: any, // The props used to create the output.

  // A queue of state updates and callbacks.
  updateQueue: UpdateQueue<any> | null,

  // The state used to create the output
  memoizedState: any,

  // A linked-list of contexts that this fiber depends on
  firstContextDependency: ContextDependency<mixed> | null,

  // Bitfield that describes properties about the fiber and its subtree. E.g.
  // the ConcurrentMode flag indicates whether the subtree should be async-by-
  // default. When a fiber is created, it inherits the mode of its
  // parent. Additional flags can be set at creation time, but after that the
  // value should remain unchanged throughout the fiber's lifetime, particularly
  // before its child fibers are created.
  mode: TypeOfMode,

  // Effect
  effectTag: SideEffectTag,

  // Singly linked list fast path to the next fiber with side-effects.
  nextEffect: Fiber | null,

  // The first and last fiber with side-effect within this subtree. This allows
  // us to reuse a slice of the linked list when we reuse the work done within
  // this fiber.
  firstEffect: Fiber | null,
  lastEffect: Fiber | null,

  // Represents a time in the future by which this work should be completed.
  // Does not include work found in its subtree.
  expirationTime: ExpirationTime,

  // This is used to quickly determine if a subtree has no pending changes.
  childExpirationTime: ExpirationTime,

  // This is a pooled version of a Fiber. Every fiber that gets updated will
  // eventually have a pair. There are cases when we can clean up pairs to save
  // memory if we need to.
  alternate: Fiber | null,

  // Time spent rendering this Fiber and its descendants for the current update.
  // This tells us how well the tree makes use of sCU for memoization.
  // It is reset to 0 each time we render and only updated when we don't bailout.
  // This field is only set when the enableProfilerTimer flag is enabled.
  actualDuration?: number,

  // If the Fiber is currently active in the "render" phase,
  // This marks the time at which the work began.
  // This field is only set when the enableProfilerTimer flag is enabled.
  actualStartTime?: number,

  // Duration of the most recent render time for this Fiber.
  // This value is not updated when we bailout for memoization purposes.
  // This field is only set when the enableProfilerTimer flag is enabled.
  selfBaseDuration?: number,

  // Sum of base times for all descedents of this Fiber.
  // This value bubbles up during the "complete" phase.
  // This field is only set when the enableProfilerTimer flag is enabled.
  treeBaseDuration?: number,

  // Conceptual aliases
  // workInProgress : Fiber ->  alternate The alternate used for reuse happens
  // to be the same as work in progress.
  // __DEV__ only
  _debugID?: number,
  _debugSource?: Source | null,
  _debugOwner?: Fiber | null,
  _debugIsCurrentlyTiming?: boolean,
|};
```
React 内部用了flow 作为类型检查。我会逐一介绍这些属性.

### tag

tag 代表了 fiber 的类型。可能的类型在 [ReactWorkTags.js](https://github.com/facebook/react/blob/master/packages/shared/ReactWorkTags.js) 中。
为了简化，SimpleReact 将只支持 ClassComponent，HostRoot， HostComponent 类型
* ClassComponent：用户定义的class组件的类型
* HostRoot：根节点的类型
* HostComponent: 特定环境中的原生节点的类型，如 Dom 中 &lt;div&gt;, Native 中的 &lt;View&gt;

### key

创建元素数组时需要包含的特殊字符串， 在某些元素被增加或删除的时候帮助 React 识别哪些元素发生了变化。为了简化，
SimpleReact 不会使用 key 作为识别变化的依据。

### type

* HostRoot 类型的 fiber，type 是 null
* ClassComponent 类型的 fiber， type 是用户声明的组件类的构造函数
* HostComponent 类型的 fiber， type 是节点的标签的字符串表示，即表示 &lt;div&gt; 的 fiber 的 type 是字符串 'div'

### stateNode

* HostRoot 类型的 fiber，stateNode 是一个 FiberRoot 类的实例
* ClassComponent 类型的 fiber，stateNode 是一个用户声明的组件类的实例
* HostComponent 类型的 fiber，stateNode 是该 fiber 表示的 dom 节点

### return, child 和 sibling

return，child 和 sibling 构造了一颗 fiber 树

### index

### ref

### pendingProps, memoizedProps 和 memoizedState

### updateQueue

### mode

### effectTag

### nextEffect, firstEffect 和 lastEffect

### expirationTime

### childExpirationTime

### alternate