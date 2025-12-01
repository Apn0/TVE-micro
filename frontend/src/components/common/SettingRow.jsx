import React from 'react';

export const SettingRow = ({ label, description, children, style }) => (
  <div style={{
    display: "flex",
    flexDirection: "column",
    marginBottom: "12px",
    borderBottom: "1px solid #333",
    paddingBottom: "8px",
    ...style
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <label style={{ color: "#ecf0f1", fontWeight: "500", fontSize: "0.95em" }}>{label}</label>
      <div style={{ marginLeft: "10px" }}>{children}</div>
    </div>
    {description && (
      <div style={{ color: "#7f8c8d", fontSize: "0.8em", marginTop: "2px" }}>
        {description}
      </div>
    )}
  </div>
);
