import { Component } from 'react'

/** Renders `fallback` if a child throws (e.g. WebGL context creation failure). */
export class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.warn('[ErrorBoundary]', error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
