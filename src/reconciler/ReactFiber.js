import { NoEffect } from '../shared/ReactSideEffectTags'
import { NoWork } from './ReactFiberExpirationTime'
import { HostRoot } from '../shared/ReactWorkTags'

export function FiberNode (tag, pendingProps) {
  // Instance
  // Tag identifying the type of fiber.
  this.tag = tag
  // Unique identifier of this child.
  // this.key = key
  // The function/class/module associated with this fiber.
  this.type = null
  // The local state associated with this fiber
  this.stateNode = null

  // Fiber
  // The Fiber to return to after finishing processing this one.
  // This is effectively the parent, but there can be multiple parents (two)
  // so this is only the parent of the thing we're currently processing.
  // It is conceptually the same as the return address of a stack frame.
  this.return = null
  // Singly Linked List Tree Structure.
  this.child = null
  this.sibling = null
  this.index = 0

  // Input is the data coming into process this fiber. Arguments. Props.
  this.pendingProps = pendingProps // This type will be more specific once we overload the tag.
  this.memoizedProps = null // The props used to create the output

  // A queue of state updates and callbacks.
  this.updateQueue = null

   // The state used to create the output
  this.memoizedState = null

  // A linked-list of contexts that this fiber depends on
  this.firstContextDependency = null

  // Effects
  this.effectTag = NoEffect
  // Singly linked list fast path to the next fiber with side-effects.
  this.nextEffect = null
  // The first and last fiber with side-effect within this subtree. This allows
  // us to reuse a slice of the linked list when we reuse the work done within
  // this fiber.
  this.firstEffect = null
  this.lastEffect = null

  // Represents a time in the future by which this work should be completed.
  // Does not include work found in its subtree.
  this.expirationTime = NoWork

  // This is used to quickly determine if a subtree has no pending changes
  this.childExpirationTime = NoWork

  // This is a pooled version of a Fiber. Every fiber that gets updated will
  // eventually have a pair. There are cases when we can clean up pairs to save
  // memory if we need to.
  this.alternate = null
}

export function createHostRootFiber () {
  return new FiberNode(HostRoot, null)
}

