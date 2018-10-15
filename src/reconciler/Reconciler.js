import {
  NoWork,
  Sync,
  msToExpirationTime,
  expirationTimeToMs,
  computeAsyncExpiration,
  computeInteractiveExpiration
} from './ReactFiberExpirationTime'
import { createUpdate, enqueueUpdate, processUpdateQueue } from './ReactUpdateQueue'
import { createFiberRoot } from './ReactFiberRoot'
import { FiberNode } from './ReactFiber'
import { isInteractiveEvent } from '../event/isInteractiveEvent'
import {
  ClassComponent,
  HostRoot, 
  HostComponent,
  SuspenseComponent
} from '../shared/ReactWorkTags'
import {
  NoEffect,
  Placement,
  Update,
  Deletion,
  DidCapture,
  Incomplete,
} from '../shared/ReactSideEffectTags'
import { traverseTwoPhase } from '../shared/ReactTreeTraversal'

function Reconciler (hostConfig) {
  const now = hostConfig.now
  const shouldSetTextContent = hostConfig.shouldSetTextContent
  const createInstance = hostConfig.createInstance
  const finalizeInitialChildren = hostConfig.finalizeInitialChildren
  const appendInitialChild = hostConfig.appendInitialChild
  const scheduleDeferredCallback = hostConfig.scheduleDeferredCallback
  const prepareUpdate = hostConfig.prepareUpdate
  const appendChildToContainer = hostConfig.appendChildToContainer
  const removeChildFromContainer = hostConfig.removeChildFromContainer
  const commitUpdate = hostConfig.commitUpdate


  let scheduledRoot = null 
  let isRendering = false
  let deadline = null
  let deadlineDidExpire = false
  let isBatchingInteractiveUpdates = false
  let isBatchingUpdates = false
  let isDispatchControlledEvent = false
  let originalStartTimeMs = now()
  let currentRendererTime = msToExpirationTime(originalStartTimeMs)
  let currentSchedulerTime = currentRendererTime
  let isWorking = false
  let isCommitting = false
  let nextUnitOfWork = null
  let nextRenderExpirationTime = NoWork
  let shouldTrackSideEffects = true
  const timeHeuristicForUnitOfWork = 1

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
      currentSchedulerTime = currentRendererTime
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
        expirationTime = computeInteractiveExpiration(currentTime)
      } else { 
        expirationTime = computeAsyncExpiration(currentTime)
      }
    }
    return expirationTime
  }

  function scheduleRootUpdate (current, element, expirationTime) {
    const update = createUpdate()
    update.payload = {element}
    enqueueUpdate(current, update)
    scheduleWork(current, expirationTime)
    return expirationTime
  }
  
  function scheduleWorkToRoot (fiber, expirationTime) {
    if (
      fiber.expirationTime === NoWork ||
      fiber.expirationTime > expirationTime
    ) {
      fiber.expirationTime = expirationTime
    }
    let alternate = fiber.alternate
    if (
      alternate !== null &&
      (alternate.expirationTime === NoWork ||
        alternate.expirationTime > expirationTime)
    ) {
      alternate.expirationTime = expirationTime
    }
    let node = fiber
    while (node !== null) {
      if (node.return === null && node.tag === HostRoot) {
        return node.stateNode
      }
      node = node.return
    }
    return null
  }

  function scheduleWork (fiber, expirationTime) {
    const root = scheduleWorkToRoot(fiber, expirationTime)
    root.expirationTime = expirationTime
    requestWork(root, expirationTime)
  }

  function requestWork (root, expirationTime) {
    scheduledRoot = root
    if (isRendering) {
      return
    }
    if (isBatchingUpdates) { 
      return
    }
    if (expirationTime === Sync) {
      performSyncWork()
    } else {
      scheduleCallbackWithExpirationTime(root, expirationTime)
    }
  }

  function scheduleCallbackWithExpirationTime(root, expirationTime) {
    const currentMs = now() - originalStartTimeMs
    const expirationTimeMs = expirationTimeToMs(expirationTime)
    const timeout = expirationTimeMs - currentMs
    scheduleDeferredCallback(performAsyncWork, {timeout})
  }

  function performSyncWork() {
    performWork(null)
  }

  function performAsyncWork (dl) {
    performWork(dl)
  }

  function performWork (dl) {
    deadline = dl
    if (deadline !== null) {
      recomputeCurrentRendererTime()
      currentSchedulerTime = currentRendererTime
      while (
        scheduledRoot !== null &&
        (!deadlineDidExpire || currentRendererTime >= scheduledRoot.expirationTime)
      ) {
        performWorkOnRoot(
          scheduledRoot,
          currentRendererTime >= scheduledRoot.expirationTime
        )
        recomputeCurrentRendererTime()
        currentSchedulerTime = currentRendererTime
      }
    } else {
      while (scheduledRoot !== null) {
        performWorkOnRoot(scheduledRoot, true)
      }
    }
    if (scheduledRoot) {
      scheduleCallbackWithExpirationTime(
        scheduledRoot,
        scheduledRoot.expirationTime,
      )
    }
    deadline = null
    deadlineDidExpire = false
  }


  function shouldYield () {
    if (deadlineDidExpire) {
      return true
    } 
    if (deadline === null || deadline.timeRemaining() > timeHeuristicForUnitOfWork) {  
      return false
    }
    deadlineDidExpire = true
    return true
  }

  function performWorkOnRoot(root, isExpired) {
    isRendering = true
    if (isExpired) { 
      let finishedWork = root.finishedWork
      if (finishedWork !== null) {   
        completeRoot(root, finishedWork)
      } else {
        root.finishedWork = null
        const isYieldy = false
        renderRoot(root, isYieldy)
        finishedWork = root.finishedWork
        if (finishedWork !== null) { 
          completeRoot(root, finishedWork)
        }
      }
    } else {
      let finishedWork = root.finishedWork
      if (finishedWork !== null) {
        completeRoot(root, finishedWork)
      } else {
        root.finishedWork = null
        const isYieldy = true
        renderRoot(root, isYieldy)
        finishedWork = root.finishedWork
        if (finishedWork !== null) {
          if (!shouldYield()) {
            completeRoot(root, finishedWork)
          } else {
            root.finishedWork = finishedWork
          }
        }
      }
    }
    isRendering = false
  }

  function createWorkInProgress(current, pendingProps, expirationTime) {
    let workInProgress = current.alternate
    if (workInProgress === null) {
      workInProgress = new FiberNode(current.tag, pendingProps)
      workInProgress.type = current.type
      workInProgress.stateNode = current.stateNode
      workInProgress.alternate = current
      current.alternate = workInProgress
    } else {
      workInProgress.pendingProps = pendingProps
      workInProgress.effectTag = NoEffect
      workInProgress.nextEffect = null
      workInProgress.firstEffect = null
      workInProgress.lastEffect = null
    }
    if (pendingProps !== current.pendingProps) {
      workInProgress.expirationTime = expirationTime
    } else {
      workInProgress.expirationTime = current.expirationTime
    }
    workInProgress.child = current.child
    workInProgress.memoizedProps = current.memoizedProps
    workInProgress.memoizedState = current.memoizedState
    workInProgress.updateQueue = current.updateQueue
    workInProgress.sibling = current.sibling
    return workInProgress
  }

  function renderRoot (root, isYieldy) {
    isWorking = true
    const expirationTime = root.expirationTime
    if (expirationTime !== nextRenderExpirationTime || nextUnitOfWork === null) {
      nextRenderExpirationTime = expirationTime
      nextUnitOfWork = createWorkInProgress(root.current, null, nextRenderExpirationTime)
    }
    do {
      try {
        workLoop(isYieldy)
      } catch (thrownValue) {
        const sourceFiber = nextUnitOfWork
        const returnFiber = sourceFiber.return
        throwException(root, returnFiber, sourceFiber, thrownValue, nextRenderExpirationTime)
        nextUnitOfWork = completeUnitOfWork(sourceFiber)
        continue
      }
      break
    } while (true) 
    isWorking = false
    if (nextUnitOfWork !== null) {
      return
    }
    root.finishedWork = root.current.alternate
  }

  function throwException(root, returnFiber, sourceFiber, value, renderExpirationTime) {
    sourceFiber.effectTag |= Incomplete
    sourceFiber.firstEffect = sourceFiber.lastEffect = null
    if (
      value !== null &&
      typeof value === 'object' &&
      typeof value.then === 'function'
    ) {
      const thenable = value
      let workInProgress = returnFiber
      do {
        if (workInProgress.tag === SuspenseComponent) {
          const onResolve = retrySuspendedRoot.bind(
            null,
            root,
            workInProgress
          )
          thenable.then(onResolve)
          workInProgress.expirationTime = renderExpirationTime
          return
        }
        workInProgress = workInProgress.return
      } while (workInProgress !== null)
    }
  }
  
  function retrySuspendedRoot (root, fiber) {
    const currentTime = requestCurrentTime()
    const retryTime = computeExpirationForFiber(currentTime)
    root.expirationTime = retryTime
    scheduleWorkToRoot(fiber, retryTime)
    requestWork(root, root.expirationTime)
  }

  function workLoop (isYieldy) {
    if (!isYieldy) {
      while (nextUnitOfWork !== null) {
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork)
      }
    } else {  
      while (nextUnitOfWork !== null && !shouldYield()) {
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork)
      }
    }
  }

  function performUnitOfWork (workInProgress) {
    const current = workInProgress.alternate
    let next = null
    next = beginWork(current, workInProgress, nextRenderExpirationTime)
    if (next === null) {
      next = completeUnitOfWork(workInProgress)
    }
    return next
  }

  function beginWork (current, workInProgress, renderExpirationTime) {
    workInProgress.expirationTime = NoWork
    const Component = workInProgress.type
    const unresolvedProps = workInProgress.pendingProps
    switch (workInProgress.tag) {
      case ClassComponent: {
        return updateClassComponent(current, workInProgress, Component, unresolvedProps, renderExpirationTime)
      }
      case HostRoot: {
        return updateHostRoot(current, workInProgress, renderExpirationTime)
      }
      case HostComponent: {
        return updateHostComponent(current, workInProgress, renderExpirationTime)
      }
      case SuspenseComponent: {
        return updateSuspenseComponent(current, workInProgress, renderExpirationTime)
      }
      default:
        throw new Error('unknown unit of work tag') 
    }
  }

  function updateSuspenseComponent (current, workInProgress, renderExpirationTime) {
    const nextProps = workInProgress.pendingProps
    const nextDidTimeout = (workInProgress.effectTag & DidCapture) !== NoEffect
    const nextChildren = nextDidTimeout ? nextProps.fallback : nextProps.children
    workInProgress.memoizedProps = nextProps
    workInProgress.memoizedState = nextDidTimeout
    reconcileChildren(current, workInProgress, nextChildren, renderExpirationTime)
    return workInProgress.child
  }

  function get(key) {
    return key._reactInternalFiber
  }

  function set(key, value) {
    key._reactInternalFiber = value
  }

  const classComponentUpdater = {
    enqueueSetState: function (inst, payload) {
      const fiber = get(inst)
      const currentTime = requestCurrentTime()
      const expirationTime = computeExpirationForFiber(currentTime)
      const update = createUpdate()
      update.payload = payload
      enqueueUpdate(fiber, update)
      scheduleWork(fiber, expirationTime)
    }
  }
  function adoptClassInstance (workInProgress, instance) {
    instance.updater = classComponentUpdater
    workInProgress.stateNode = instance
    set(instance, workInProgress)
  }

  function constructClassInstance (workInProgress, ctor, props) {
    let instance =  new ctor(props)
    workInProgress.memoizedState = instance.state !== null && instance.state !== undefined ? instance.state : null
    adoptClassInstance(workInProgress, instance)
    return instance
  }

  function applyDerivedStateFromProps (workInProgress, getDerivedStateFromProps, nextProps) {
    const prevState = workInProgress.memoizedState
    const partialState = getDerivedStateFromProps(nextProps, prevState)
    const memoizedState = partialState === null || partialState === undefined ? prevState : Object.assign({}, prevState, partialState)
    workInProgress.memoizedState = memoizedState
    const updateQueue = workInProgress.updateQueue
    if (updateQueue !== null && workInProgress.expirationTime === NoWork) {
      updateQueue.baseState = memoizedState
    }
  }
  
  function mountClassInstance(workInProgress, ctor, newProps) {
    let instance = workInProgress.stateNode
    instance.props = newProps
    instance.state = workInProgress.memoizedState
    const updateQueue = workInProgress.updateQueue
    if (updateQueue !== null) {
      processUpdateQueue(workInProgress, updateQueue)
      instance.state = workInProgress.memoizedState
    }
    const getDerivedStateFromProps = ctor.getDerivedStateFromProps
    if (typeof getDerivedStateFromProps === 'function') {
      applyDerivedStateFromProps(workInProgress, getDerivedStateFromProps, newProps)
      instance.state = workInProgress.memoizedState
    }
  }
  
  function checkShouldComponentUpdate(workInProgress, newProps, newState) {
    const instance = workInProgress.stateNode
    if (typeof instance.shouldComponentUpdate === 'function') {
      const shouldUpdate = instance.shouldComponentUpdate(newProps, newState)
      return shouldUpdate
    }
    return true
  }
  
  function updateClassInstance (current, workInProgress, ctor, newProps) {
    const instance = workInProgress.stateNode
    const oldProps = workInProgress.memoizedProps
    instance.props = oldProps
    const oldState = workInProgress.memoizedState
    let newState = instance.state = oldState
    let updateQueue = workInProgress.updateQueue
    if (updateQueue !== null) {
      processUpdateQueue(
        workInProgress,
        updateQueue
      )
      newState = workInProgress.memoizedState
    }
    if (oldProps === newProps && oldState === newState) {
      return false
    }
    const getDerivedStateFromProps = ctor.getDerivedStateFromProps
    if (typeof getDerivedStateFromProps === 'function') {
      applyDerivedStateFromProps(workInProgress, getDerivedStateFromProps, newProps)
      newState = workInProgress.memoizedState
    }
    const shouldUpdate = checkShouldComponentUpdate(workInProgress, newProps, newState)
    if (shouldUpdate) {
      if (typeof instance.componentDidUpdate === 'function') {
        workInProgress.effectTag |= Update
      }
    }
    instance.props = newProps
    instance.state = newState
    return shouldUpdate
  }

  function updateClassComponent (current, workInProgress, Component, nextProps, renderExpirationTime) {
    let shouldUpdate
    if (current === null) {
      constructClassInstance(workInProgress, Component, nextProps)
      mountClassInstance(workInProgress, Component, nextProps)
      shouldUpdate = true
    } else {
      shouldUpdate = updateClassInstance(current, workInProgress, Component, nextProps)
    }
    return finishClassComponent(current, workInProgress, shouldUpdate, renderExpirationTime)
  }

  function cloneChildFibers(workInProgress) {
    if (workInProgress.child === null) {
      return
    }
    let currentChild = workInProgress.child
    let newChild = createWorkInProgress(currentChild, currentChild.pendingProps, currentChild.expirationTime)
    workInProgress.child = newChild
    newChild.return = workInProgress
    while (currentChild.sibling !== null) {
      currentChild = currentChild.sibling
      newChild = newChild.sibling = createWorkInProgress(currentChild, currentChild.pendingProps, currentChild.expirationTime)
      newChild.return = workInProgress
    }
    newChild.sibling = null
  }

  function finishClassComponent (current, workInProgress, shouldUpdate, renderExpirationTime) {
    if (!shouldUpdate) {
      cloneChildFibers(workInProgress)
    } else {
      const instance = workInProgress.stateNode
      const nextChildren = instance.render()
      reconcileChildren(current, workInProgress, nextChildren, renderExpirationTime)
      memoizeState(workInProgress, instance.state)
      memoizeProps(workInProgress, instance.props)
    }
    return workInProgress.child
  }

  function reconcileChildren (current, workInProgress, nextChildren, renderExpirationTime) {
    if (current === null) {
      shouldTrackSideEffects = false
      workInProgress.child = reconcileChildFibers(workInProgress, null, nextChildren, renderExpirationTime)
    } else {
      shouldTrackSideEffects = true
      workInProgress.child = reconcileChildFibers(workInProgress, current.child, nextChildren, renderExpirationTime)
    }
  }

  function reconcileChildFibers(returnFiber, currentFirstChild, newChild, expirationTime) {
    if (newChild) {
      const childArray = Array.isArray(newChild) ? newChild : [newChild]
      return reconcileChildrenArray(returnFiber, currentFirstChild, childArray, expirationTime)
    } else {
      return null
    }
  }

  function createFiberFromElement (element, expirationTime) {
    let fiber
    const type = element.type
    const pendingProps = element.props
    let fiberTag
    if (typeof type === 'function') {
      fiberTag = ClassComponent
    } else if (typeof type === 'string') {
      fiberTag = HostComponent
    }else {
      fiberTag = SuspenseComponent
    }
    fiber = new FiberNode(fiberTag, pendingProps)
    fiber.type = type
    fiber.expirationTime = expirationTime
    return fiber
  }

  function useFiber (fiber, pendingProps, expirationTime) {
    let clone = createWorkInProgress(fiber, pendingProps, expirationTime)
    clone.sibling = null
    return clone
  }
  
  function createChild (returnFiber, newChild, expirationTime) {
    if (typeof newChild === 'object' && newChild !== null) {
      let created = createFiberFromElement(newChild, expirationTime)
      created.return = returnFiber
      return created
    }
    return null
  }

  function updateElement (returnFiber, current, element, expirationTime) {
    if (current !== null && current.type === element.type) {
      const existing = useFiber(current, element.props, expirationTime)
      existing.return = returnFiber
      return existing
    } else {
      const created = createFiberFromElement(element, expirationTime)
      created.return = returnFiber
      return created
    } 
  }

  function updateSlot (returnFiber, oldFiber, newChild, expirationTime) {
    if (typeof newChild === 'object' && newChild !== null) {
      return updateElement(returnFiber, oldFiber, newChild, expirationTime)
    }
    return null
  }

  function deleteChild (returnFiber, childToDelete) {
    const last = returnFiber.lastEffect
    if (last !== null) {
      last.nextEffect = childToDelete
      returnFiber.lastEffect = childToDelete
    } else {
      returnFiber.firstEffect = returnFiber.lastEffect = childToDelete
    }
    childToDelete.nextEffect = null
    childToDelete.effectTag = Deletion
  }

  function reconcileChildrenArray (returnFiber, currentFirstChild, newChildren, expirationTime) {
    let resultingFirstChild = null
    let previousNewFiber = null
    let oldFiber = currentFirstChild
    let newIdx = 0
    for (; oldFiber !== null && newIdx < newChildren.length; newIdx ++) {
      let newFiber = updateSlot(returnFiber, oldFiber, newChildren[newIdx], expirationTime)
      if (shouldTrackSideEffects) {
        if (oldFiber && newFiber.alternate === null) {
          deleteChild(returnFiber, oldFiber)
          newFiber.effectTag = Placement
        }
      }
      if (resultingFirstChild === null) {
        resultingFirstChild = newFiber
      } else {
        previousNewFiber.sibling = newFiber
      }
      previousNewFiber = newFiber
      oldFiber = oldFiber.sibling
    }
    if (oldFiber === null) {
      for (; newIdx < newChildren.length; newIdx++) {
        let _newFiber = createChild(returnFiber, newChildren[newIdx], expirationTime)
        if (shouldTrackSideEffects && _newFiber.alternate === null) {
          _newFiber.effectTag = Placement
        }     
        if (resultingFirstChild === null) {
          resultingFirstChild = _newFiber
        } else {
          previousNewFiber.sibling = _newFiber
        }
        previousNewFiber = _newFiber
      }
      return resultingFirstChild
    }
  }

  function memoizeProps(workInProgress, nextProps) {
    workInProgress.memoizedProps = nextProps
  }

  function memoizeState(workInProgress, nextState) {
    workInProgress.memoizedState = nextState
  }

  function updateHostRoot (current, workInProgress, renderExpirationTime) {
    const updateQueue = workInProgress.updateQueue
    const prevState = workInProgress.memoizedState
    const prevChildren = prevState !== null ? prevState.element : null
    processUpdateQueue(workInProgress, updateQueue)
    const nextState = workInProgress.memoizedState
    const nextChildren = nextState.element
    if (nextChildren === prevChildren) {
      cloneChildFibers(workInProgress)
      return workInProgress.child
    }
    reconcileChildren(current, workInProgress, nextChildren, renderExpirationTime)
    return workInProgress.child
  }

  function updateHostComponent (current, workInProgress, renderExpirationTime) {
    const nextProps = workInProgress.pendingProps
    let nextChildren = nextProps.children
    const isDirectTextChild = shouldSetTextContent(nextProps)
    if (isDirectTextChild) {
      nextChildren = null
    }
    reconcileChildren(current, workInProgress, nextChildren, renderExpirationTime)
    memoizeProps(workInProgress, nextProps)
    return workInProgress.child
  }

  function markUpdate(workInProgress) {
    workInProgress.effectTag |= Update
  }  

  function appendAllChildren (parent, workInProgress) {
    let node = workInProgress.child
    while (node !== null) {
      if (node.tag === HostComponent) {
        appendInitialChild(parent, node.stateNode)
      } else if (node.child !== null) {
        node.child.return = node
        node = node.child
        continue
      }
      if (node ===  workInProgress) {
        return
      }
      while (node.sibling === null) {
        if (node.return === null || node.return === workInProgress) {
          return
        }
        node = node.return
      }
      node.sibling.return = node.return
      node = node.sibling
    }
  }

  function completeWork (current, workInProgress) {
    const newProps = workInProgress.pendingProps
    switch(workInProgress.tag) {
      case ClassComponent: {
        break
      }
      case HostRoot: {
        break
      }
      case HostComponent: {
        const type = workInProgress.type
        if (current !== null && workInProgress.stateNode != null) {
          const oldProps = current.memoizedProps
          const updatePayload = prepareUpdate(oldProps, newProps)
          workInProgress.updateQueue = updatePayload
          if (updatePayload) {
            markUpdate(workInProgress)
          }
        } else {
          const _instance = createInstance(type, newProps, workInProgress)
          appendAllChildren(_instance, workInProgress)
          finalizeInitialChildren(_instance, newProps)
          workInProgress.stateNode = _instance
        }
        break
      }
      case SuspenseComponent: {
        break
      }
      default: {
        throw new Error('Unknown unit of work tag')
      }
    }
    return null
  }

  function completeUnitOfWork (workInProgress) {
    while (true) {
      const current = workInProgress.alternate
      const returnFiber = workInProgress.return
      const siblingFiber = workInProgress.sibling
      if ((workInProgress.effectTag & Incomplete) === NoEffect) {
        completeWork(current, workInProgress)
        if (returnFiber !== null &&
          (returnFiber.effectTag & Incomplete) === NoEffect) {
            if (returnFiber.firstEffect === null) {
              returnFiber.firstEffect = workInProgress.firstEffect
            }
            if (workInProgress.lastEffect !== null) {
              if (returnFiber.lastEffect !== null) {
                returnFiber.lastEffect.nextEffect = workInProgress.firstEffect
              }
              returnFiber.lastEffect = workInProgress.lastEffect
            }
            const effectTag = workInProgress.effectTag
            if (effectTag >= Placement) {
              if (returnFiber.lastEffect !== null) {
                returnFiber.lastEffect.nextEffect = workInProgress
              } else {
                returnFiber.firstEffect = workInProgress
              }
              returnFiber.lastEffect = workInProgress
            }
          }
        if (siblingFiber !== null) {
          return siblingFiber
        } else if (returnFiber !== null) {
          workInProgress = returnFiber
          continue
        } else {
          return null
        }
      } else {
        if (workInProgress.tag === SuspenseComponent) {
          const effectTag = workInProgress.effectTag
          workInProgress.effectTag = effectTag & ~Incomplete | DidCapture
          return workInProgress
        }
        if (returnFiber !== null) {
          returnFiber.firstEffect = returnFiber.lastEffect = null
          returnFiber.effectTag |= Incomplete
        }
        if (siblingFiber !== null) {
          return siblingFiber
        } else if (returnFiber !== null) {
          workInProgress = returnFiber
          continue
        } else {
          return null
        }
      }
    }
  }

  function completeRoot(root, finishedWork) {
    root.finishedWork = null
    scheduledRoot = null
    commitRoot(root, finishedWork)
  }

  function getHostParentFiber(fiber) {
    let parent = fiber.return
    while (parent !== null) {
      if (isHostParent(parent)) {
        return parent
      }
      parent = parent.return
    }
  }

  function isHostParent(fiber) {
    return fiber.tag === HostComponent || fiber.tag === HostRoot
  }

  function commitPlacement (finishedWork) {
    const parentFiber = getHostParentFiber(finishedWork)
    const parent = parentFiber.tag === HostRoot ? parentFiber.stateNode.containerInfo : parentFiber.stateNode
    let node = finishedWork
    while (true) {
      if (node.tag === HostComponent) {
        appendChildToContainer(parent, node.stateNode)
      } else if (node.child !== null) {
        node.child.return = node
        node = node.child
        continue
      }
      if (node === finishedWork) {
        return
      }
      while (node.sibling === null) {
        if (node.return === null || node.return === finishedWork) {
          return
        }
        node = node.return
      }
      node.sibling.return = node.return
      node = node.sibling
    }
  }

  function commitWork (finishedWork) {
    switch (finishedWork.tag) {
      case HostRoot: 
      case ClassComponent: {
        return
      }
      case HostComponent: {
        const instance = finishedWork.stateNode
        if (instance != null) {
          const updatePayload = finishedWork.updateQueue
          finishedWork.updateQueue = null
          if (updatePayload !== null) {
            commitUpdate(instance, updatePayload)
          }
        }
        return
      }
      case SuspenseComponent: {
        return
      }
      default: {
        throw new Error('This unit of work tag should not have side-effects')
      }
    }
  }

  function commitUnmount (current) {
    if (current.tag === ClassComponent) {
      const instance = current.stateNode
      if (typeof instance.componentWillUnmount === 'function') {
        instance.props = current.memoizedProps
        instance.state = current.memoizedState
        instance.componentWillUnmount()
      }
    }
  }
  
  function commitNestedUnmounts (root) {
    let node = root
    while (true) {
      commitUnmount(node)
      if (node.child !== null) {
        node.child.return = node
        node = node.child
        continue
      }
      if (node === root) {
        return
      }
      while (node.sibling === null) {
        if (node.return === null || node.return === root) {
          return
        }
        node = node.return
      }
      node.sibling.return = node.return
      node = node.sibling
    }
  }
  
  function commitDeletion (current) {
    const parentFiber = getHostParentFiber(current)
    const parent = parentFiber.tag === HostRoot ? parentFiber.stateNode.containerInfo : parentFiber.stateNode
    let node = current
    while (true) {
      if (node.tag === HostComponent) {
        commitNestedUnmounts(node)
        removeChildFromContainer(parent, node.stateNode) 
      } else {
        commitUnmount(node)
        if (node.child !== null) {
          node.child.return = node
          node = node.child
          continue
        }
      }   
      if (node === current) {
        break
      }
      while (node.sibling === null) {
        if (node.return === null || node.return === current) {
          break
        }
        node = node.return
      }
      node.sibling.return = node.return
      node = node.sibling
    }
    current.return = null
    current.child = null
    if (current.alternate) {
      current.alternate.child = null
      current.alternate.return = null
    }
  }

  function commitAllHostEffects (firstEffect) {
    let nextEffect = firstEffect
    while (nextEffect !== null) {
      const effectTag = nextEffect.effectTag
      switch(effectTag & (Placement | Update | Deletion)) {
        case Placement: {
          commitPlacement(nextEffect)
          nextEffect.effectTag &= ~Placement
          break
        }
        case Update: {
          commitWork(nextEffect)
          break
        }
        case Deletion: {
          commitDeletion(nextEffect)
          break
        }
      }
      nextEffect = nextEffect.nextEffect
    }    
  }

  function commitBeforeMutationLifeCycles (firstEffect) {
    let nextEffect = firstEffect 
    while (nextEffect !== null) {
      if (nextEffect.tag === ClassComponent) {
        const instance = nextEffect.stateNode
        const getSnapshotBeforeUpdate = nextEffect.stateNode.getSnapshotBeforeUpdate
        if (typeof getSnapshotBeforeUpdate === 'function') {
          const current = nextEffect.alternate
          const prevProps = current.memoizedProps
          const prevState = current.memoizedState
          instance.props = nextEffect.memoizedProps
          instance.state = nextEffect.memoizedState
          const snapshot = getSnapshotBeforeUpdate(prevProps, prevState)
          instance.__reactInternalSnapshotBeforeUpdate = snapshot
        }
      }    
      nextEffect = nextEffect.nextEffect
    }
  }
  
  function commitAllLifeCycles (firstEffect) {
    let nextEffect = firstEffect 
    while (nextEffect !== null) {
      if (nextEffect.tag === ClassComponent) {
        const instance = nextEffect.stateNode
        const componentDidMount = instance.componentDidMount
        const componentDidUpdate = instance.componentDidUpdate
        const current = nextEffect.alternate
        if (current === null) {
          if (typeof componentDidMount === 'function') {
            instance.props = nextEffect.memoizedProps
            instance.state = nextEffect.memoizedState
            instance.componentDidMount()
          }
        } else {
          if (typeof componentDidUpdate === 'function') {
            const prevProps = current.memoizedProps
            const prevState = current.memoizedState
            instance.props = nextEffect.memoizedProps
            instance.state = nextEffect.memoizedState
            instance.componentDidUpdate(prevProps, prevState, instance.__reactInternalSnapshotBeforeUpdate)
          }
        }
      }    
      nextEffect = nextEffect.nextEffect
    }
  }
  
  function commitRoot(root, finishedWork) {
    isWorking = true
    isCommitting = true
    root.expirationTime = NoWork
    const firstEffect = finishedWork.firstEffect
    commitBeforeMutationLifeCycles(firstEffect)
    commitAllHostEffects(firstEffect)
    root.current = finishedWork
    commitAllLifeCycles(firstEffect)
    isCommitting = false
    isWorking = false
  }

  function dispatchEventWithBatch (nativeEvent) {
    const type = nativeEvent.type
    let previousIsBatchingInteractiveUpdates = isBatchingInteractiveUpdates
    let previousIsBatchingUpdates = isBatchingUpdates
    let previousIsDispatchControlledEvent = isDispatchControlledEvent
    if (type === 'change') {
      isDispatchControlledEvent = true
    }
    if (isInteractiveEvent(type)) {
      isBatchingInteractiveUpdates = true
    }
    isBatchingUpdates = true
    
    try {
      return dispatchEvent(nativeEvent) 
    } finally {
      isBatchingInteractiveUpdates = previousIsBatchingInteractiveUpdates
      isBatchingUpdates = previousIsBatchingUpdates
      if (!isBatchingUpdates && !isRendering) {
        if (isDispatchControlledEvent) {
          isDispatchControlledEvent = previousIsDispatchControlledEvent
          if (scheduledRoot) {
            performSyncWork()
          }  
        } else {
          if (scheduledRoot) {
            scheduleCallbackWithExpirationTime(scheduledRoot, scheduledRoot.expirationTime)
          }
        }
      }
    }
  }
  
  function dispatchEvent (nativeEvent) {
    let listeners = []
    const nativeEventTarget = nativeEvent.target || nativeEvent.srcElement
    const targetInst = nativeEventTarget.internalInstanceKey
    traverseTwoPhase(targetInst, accumulateDirectionalDispatches.bind(null, listeners), nativeEvent)
    listeners.forEach(listener => listener(nativeEvent))
  }
  
  function accumulateDirectionalDispatches (acc, inst, phase, nativeEvent) {
    let type = nativeEvent.type
    let registrationName = 'on' + type[0].toLocaleUpperCase() + type.slice(1)
    if (phase === 'captured') {
      registrationName = registrationName + 'Capture'
    }
    const stateNode = inst.stateNode
    const props = stateNode.internalEventHandlersKey
    const listener = props[registrationName]
    if (listener) {
      acc.push(listener)
    }
  }

  return {
    createContainer,
    updateContainer,
    dispatchEventWithBatch
  }
}

export default Reconciler