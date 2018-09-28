class ReactElement {
  constructor (type, props) {
    this.type = type,
    this.props = props
  }
}

export function createElement(type, config, ...children) {
  console.log('createElement')
  console.log('type: ', type)
  console.log('config: ', config)
  console.log('children: ', children)
  const props = {}
  if (config !== null) {
    Object.keys(config).forEach(propName => 
      props[propName] = config[propName])
  }
  // Children can be more than one argument, and those are transferred onto
  // the newly allocated props object.
  if (children.length >= 1) {
    props.children = children.length === 1 ? children[0] : children
  }
  return new ReactElement(type, props)
}