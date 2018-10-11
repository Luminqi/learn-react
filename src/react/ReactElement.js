class ReactElement {
  constructor (type, props) {
    this.type = type
    this.props = props
  }
}

export function createElement(type, config, ...children) {
  const props = {}
  if (config !== null) {
    Object.keys(config).forEach(propName => 
      props[propName] = config[propName])
  }
  if (children.length >= 1) {
    props.children = children.length === 1 ? children[0] : children
  }
  return new ReactElement(type, props)
}