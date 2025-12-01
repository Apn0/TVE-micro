import React from 'react';
import { styles } from '../../styles';

export const ConfigSection = ({ title, description, children, style }) => (
  <div style={{ ...styles.panel, ...style }}>
    {title && (
      <h3 style={{
        borderBottom: "2px solid #e67e22",
        paddingBottom: "5px",
        marginTop: "10px",
        marginBottom: "15px",
        color: "#e67e22"
      }}>
        {title}
      </h3>
    )}
    {description && (
      <p style={{ color: "#95a5a6", margin: "0 0 15px 0", fontSize: "0.9em" }}>
        {description}
      </p>
    )}
    {children}
  </div>
);
