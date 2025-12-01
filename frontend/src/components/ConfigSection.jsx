import React from "react";
import { styles } from "../styles";

const ConfigSection = ({ title, description, children }) => (
  <div style={styles.panel}>
    {title && (
      <h3 style={{
        borderBottom: "2px solid #e67e22",
        paddingBottom: "5px",
        marginTop: "0",
        marginBottom: "15px",
        color: "#e67e22"
      }}>
        {title}
      </h3>
    )}
    {description && (
      <p style={{ color: "#95a5a6", margin: "-10px 0 15px 0", fontSize: "0.9em" }}>
        {description}
      </p>
    )}
    {children}
  </div>
);

export default ConfigSection;
