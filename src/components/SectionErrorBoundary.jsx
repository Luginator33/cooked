import React from "react";

const C = {
  bg: "#0a0a0f",
  bg2: "#12121a",
  text: "#f5f0eb",
  muted: "rgba(245,240,235,0.3)",
  terracotta: "#ff9632",
  border: "rgba(255,255,255,0.04)",
};

/**
 * Wraps a section/tab so that if it crashes, only that section shows an error
 * instead of nuking the whole app. The rest of the app keeps working.
 */
export class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[SectionErrorBoundary] ${this.props.name || "Section"} crashed:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
          textAlign: "center",
          minHeight: 200,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>
            {this.props.icon || "😵"}
          </div>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: "italic",
            fontSize: 16,
            color: C.text,
            marginBottom: 6,
          }}>
            {this.props.name || "This section"} hit a snag
          </div>
          <div style={{
            fontSize: 12,
            color: C.muted,
            marginBottom: 16,
            fontFamily: "'Inter', -apple-system, sans-serif",
            maxWidth: 280,
          }}>
            Don't worry — the rest of the app still works.
          </div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${C.border}`,
              borderRadius: 20,
              padding: "8px 20px",
              color: C.terracotta,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "'Inter', -apple-system, sans-serif",
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default SectionErrorBoundary;
