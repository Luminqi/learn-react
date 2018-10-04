# Fiber 架构

在 CustomRenderer 章节，我们定义了一个简单组件，通过初次渲染和点击按钮，可以调试 React 的 mount 和 update 阶段。在 ReactReconciler 中的函数入口加上 console.log, 可以得到其触发函数的流程图。

![flowchart](Images/Fiber_flowchart.PNG)

注意这不是完整的 React 内部被触发的函数流程图。我已经省略了许多与错误处理等功能相关的函数，并且没有把我决定留下的函数都放在图中，这是为了尽可能不让它看起来过于复杂。

我会按函数的触发先后顺序来介绍它们。并且我把这整个流程图大致分为三个阶段：schedule 阶段，render 阶段 和 commit 阶段。这样划分只是为了方便陈述，如果你看了 [Lin Clark's A Cartoon Intro to Fiber](https://www.youtube.com/watch?v=ZCuYPiUIONs)，里面只有 render 和 commit 的划分。

## schedule 阶段
```javascript
CustomDom.render(<App />, document.getElementById('root'))

const CustomDom = {
  render: (reactElement, container) => {
    let root = container._reactRootContainer
    if (!root) {
      root = container._reactRootContainer = customRenderer.createContainer(container)
    }
    customRenderer.updateContainer(reactElement, root)
  }
};

function createContainer (containerInfo) {
  return createFiberRoot(containerInfo)
}

function updateContainer (element, container) {
  const current = container.current
  const currentTime = requestCurrentTime()
  const expirationTime = computeExpirationForFiber(currentTime)
  return scheduleRootUpdate(current, element, expirationTime)
}

function requestCurrentTime() {
  if (isRendering) {
    return currentSchedulerTime
  }
  if (!scheduledRoot) {
    recomputeCurrentRendererTime()
    currentSchedulerTime = currentRendererTime;
    return currentSchedulerTime
  }
  return currentSchedulerTime
}

function recomputeCurrentRendererTime () {
  let currentTimeMs = now() - originalStartTimeMs
  currentRendererTime = msToExpirationTime(currentTimeMs)
}

function computeExpirationForFiber (currentTime) {
  let expirationTime
  if (isWorking) {
    if (isCommitting) {
      expirationTime = Sync
    } else {
      expirationTime = nextRenderExpirationTime
    }
  } else {
    if (isBatchingInteractiveUpdates) {
      expirationTime = computeInteractiveExpiration(currentTime);
    } else {
      expirationTime = computeAsyncExpiration(currentTime);
    }
  }
  return expirationTime;
}
```

当我们初次调用 CustomDom.render 时，首先会调用 createContainer 创建一个 fiberRoot，然后调用 updateContainer 来渲染组件。注意传入 createContainer 的参数 container 就是我们希望组件渲染在其之下的 DOM 节点。传入 updateContainer 的第一个参数就是&lt;App /&gt; 对应的 Elmenet 对象。Elmenet 对象将在 ReactCore 章节介绍。






