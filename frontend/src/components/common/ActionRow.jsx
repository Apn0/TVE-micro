import React from 'react';
import { styles } from '../../styles';

export const ActionRow = ({ children, style }) => (
  <div style={{
    display: "flex",
    gap: "10px",
    marginTop: "15px",
    justifyContent: "flex-end", // Align actions to the right by default, or keep explicit?
    // EngineeringScreen had them left-aligned in a flex container.
    // "display: flex, gap: 10px, marginTop: 15px" matches EngineeringScreen
    ...style
  }}>
    {children}
  </div>
);
