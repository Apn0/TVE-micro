
import React, { useState } from "react";
import { styles } from "../App";

/**
 * AlarmsScreen Component.
 *
 * Displays a list of currently active system alarms and allows viewing historical alarms.
 * Provides controls to acknowledge and clear alarms.
 *
 * @param {object} props - Component props.
 * @param {Array} props.activeAlarms - List of currently active alarm objects.
 * @param {Array} props.alarmHistory - List of all historical alarm objects.
 * @param {function} props.sendCmd - Function to send commands to the backend (e.g., ACKNOWLEDGE_ALARM).
 */
function AlarmsScreen({ activeAlarms, alarmHistory, sendCmd }) {
  const [showHistory, setShowHistory] = useState(false);

  // Filter out cleared alarms from activeAlarms list (just in case backend sends them)
  // Backend active_alarms should only contain active ones, but safety first.
  const displayActive = activeAlarms.filter(a => !a.cleared);

  // Sort history by timestamp desc
  const displayHistory = [...alarmHistory].sort((a, b) => b.timestamp - a.timestamp);

  const formatTime = (ts) => {
    return new Date(ts * 1000).toLocaleString();
  };

  const calculateDuration = (ts) => {
    const diff = Date.now() / 1000 - ts;
    if (diff < 60) return `${diff.toFixed(0)}s`;
    if (diff < 3600) return `${(diff / 60).toFixed(0)}m`;
    return `${(diff / 3600).toFixed(1)}h`;
  };

  const getSeverityColor = (severity) => {
    if (severity === "CRITICAL") return "#e74c3c";
    return "#f1c40f";
  };

  const AlarmItem = ({ alarm, historic }) => (
    <div style={{
      background: "#1a1f27",
      borderLeft: `5px solid ${getSeverityColor(alarm.severity)}`,
      borderRadius: "4px",
      padding: "15px",
      marginBottom: "10px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "5px" }}>
          <span style={{
            fontWeight: "bold",
            color: getSeverityColor(alarm.severity),
            background: "rgba(0,0,0,0.3)",
            padding: "2px 6px",
            borderRadius: "4px",
            fontSize: "0.8em"
          }}>
            {alarm.severity}
          </span>
          <span style={{ fontWeight: "bold", fontSize: "1.1em", color: "#ecf0f1" }}>
            {alarm.type}
          </span>
        </div>
        <div style={{ color: "#aaa", fontSize: "0.9em" }}>
          {formatTime(alarm.timestamp)} • Duration: {calculateDuration(alarm.timestamp)}
          {historic && alarm.cleared && " • CLEARED"}
          {!historic && alarm.acknowledged && " • ACKNOWLEDGED"}
        </div>
        <div style={{ marginTop: "5px", color: "#ccc" }}>
          {alarm.message}
        </div>
      </div>
      {!historic && !alarm.acknowledged && (
        <button
          style={styles.buttonSecondary}
          onClick={() => sendCmd("ACKNOWLEDGE_ALARM", { alarm_id: alarm.id })}
        >
          ACKNOWLEDGE
        </button>
      )}
      {!historic && alarm.acknowledged && (
         <span style={{ color: "#2ecc71", fontStyle: "italic", fontSize: "0.9em", marginRight: "10px" }}>
           Acknowledged
         </span>
      )}
    </div>
  );

  const allAcknowledged = displayActive.every(a => a.acknowledged);

  return (
    <div>
      <div style={styles.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2>{showHistory ? "Alarm History" : "Active Alarms"}</h2>
          <div>
            {!showHistory && (
              <>
                 <button
                    style={styles.button}
                    onClick={() => sendCmd("ACKNOWLEDGE_ALARM", { alarm_id: "all" })}
                    disabled={displayActive.length === 0 || allAcknowledged}
                 >
                   Acknowledge All
                 </button>
                 <button
                    style={{...styles.button, background: allAcknowledged && displayActive.length > 0 ? "#27ae60" : "#555", cursor: allAcknowledged ? "pointer" : "not-allowed"}}
                    onClick={() => allAcknowledged && sendCmd("CLEAR_ALARM")}
                    disabled={!allAcknowledged || displayActive.length === 0}
                 >
                   Clear Alarms
                 </button>
              </>
            )}
            <button
              style={styles.buttonSecondary}
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? "View Active" : "View History"}
            </button>
          </div>
        </div>

        {showHistory ? (
          <div>
            {displayHistory.length === 0 && <div style={{color: "#777"}}>No alarm history.</div>}
            {displayHistory.map((alarm) => (
              <AlarmItem key={alarm.id} alarm={alarm} historic={true} />
            ))}
          </div>
        ) : (
          <div>
            {displayActive.length === 0 && (
              <div style={{
                padding: "40px",
                textAlign: "center",
                color: "#2ecc71",
                border: "2px dashed #2ecc71",
                borderRadius: "8px",
                background: "rgba(46, 204, 113, 0.05)"
              }}>
                <h3>No Active Alarms</h3>
                <p>System is running normally.</p>
              </div>
            )}
            {displayActive.map((alarm) => (
              <AlarmItem key={alarm.id} alarm={alarm} historic={false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AlarmsScreen;
