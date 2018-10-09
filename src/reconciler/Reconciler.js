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
import {
  ClassComponent,
  HostRoot, 
  HostComponent,
} from '../shared/ReactWorkTags'
import {
  NoEffect,
  Placement,
  Update,
  Incomplete,
} from '../shared/ReactSideEffectTags'

function Reconciler (hostConfig) {
  const now = hostConfig.now
  const shouldSetTextContent = hostConfig.shouldSetTextContent
  const createInstance = hostConfig.createInstance
  const finalizeInitialChildren = hostConfig.finalizeInitialChildren
  const appendInitialChild = hostConfig.appendInitialChild
  const scheduleDeferredCallback = hostConfig.scheduleDeferredCallback
  const prepareUpdate = hostConfig.prepareUpdate
  const appendChildToContainer = hostConfig.appendChildToContainer
  const commitUpdate = hostConfig.commitUpdate


  let scheduledRoot = null 
  let isRendering = false
  let deadline = null
  let deadlineDidExpire = false
  let isBatchingInteractiveUpdates = false
  let isBatchingUpdates = false
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
    } {
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
    workLoop(isYieldy) 
    isWorking = false
    if (nextUnitOfWork !== null) {
      return
    }
    root.finishedWork = root.current.alternate
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
      case HostComponent:{
        return updateHostComponent(current, workInProgress, renderExpirationTime)
      }
      default:
        throw new Error('unknown unit of work tag') 
    }
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

  function mountClassInstance(workInProgress, ctor, newProps) {
    let instance = workInProgress.stateNode
    instance.props = newProps
    instance.state = workInProgress.memoizedState
    const updateQueue = workInProgress.updateQueue
    if (updateQueue !== null) {
      processUpdateQueue(workInProgress, updateQueue)
      instance.state = workInProgress.memoizedState
    }
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
    instance.props = newProps
    instance.state = newState
    return true
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
    }
    return null
  }

  function updateSlot (returnFiber, oldFiber, newChild, expirationTime) {
    if (typeof newChild === 'object' && newChild !== null) {
      return updateElement(returnFiber, oldFiber, newChild, expirationTime)
    }
    return null
  }

  function reconcileChildrenArray (returnFiber, currentFirstChild, newChildren, expirationTime) {
    let resultingFirstChild = null
    let previousNewFiber = null
    let oldFiber = currentFirstChild
    let newIdx = 0
    for (; oldFiber !== null && newIdx < newChildren.length; newIdx ++) {
      let newFiber = updateSlot(returnFiber, oldFiber, newChildren[newIdx], expirationTime)
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
          //initial pass
          const _instance = createInstance(type, newProps, workInProgress)
          appendAllChildren(_instance, workInProgress)
          finalizeInitialChildren(_instance, newProps)
          workInProgress.stateNode = _instance
        }
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
      default: {
        throw new Error('This unit of work tag should not have side-effects')
      }
    }
  }

  function commitAllHostEffects (firstEffect) {
    let nextEffect = firstEffect
    while (nextEffect !== null) {
      const effectTag = nextEffect.effectTag
      switch(effectTag & (Placement | Update)) {
        case Placement: {
          commitPlacement(nextEffect)
          nextEffect.effectTag &= ~Placement
          break
        }
        case Update: {
          commitWork(nextEffect)
          break
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
    commitAllHostEffects(firstEffect)
    root.current = finishedWork
    isCommitting = false
    isWorking = false
  }
  return {
    createContainer,
    updateContainer
  }
}

export default Reconciler