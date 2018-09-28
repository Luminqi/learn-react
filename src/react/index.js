import { createElement } from './ReactElement'
import { Component } from './ReactComponent'

const React = {
  Component,
  createElement,
  Placeholder: Symbol.for('react.placeholder')
}

export default React