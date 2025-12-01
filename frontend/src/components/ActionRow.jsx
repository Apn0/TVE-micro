import React from "react";

const ActionRow = ({ children, style }) => (
  <div style={{ display: "flex", gap: "10px", marginTop: "15px", justifyContent: "flex-start", ...style }}>
    {children}
  </div>
);

export default ActionRow;
