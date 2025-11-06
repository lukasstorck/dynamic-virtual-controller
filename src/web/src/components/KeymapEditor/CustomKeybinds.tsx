// CustomKeybinds.tsx
import { Button, Row, Col } from "react-bootstrap";
import { useDataContext } from "../../hooks/useDataContext";
import CustomKeybindRow from "./CustomKeybindRow";
import type { CustomKeybind } from "../../types";

export default function CustomKeybinds() {
  const { customKeybinds, setCustomKeybinds, devicesBySlot } = useDataContext();

  const handleAdd = () => {
    const newKeybind: CustomKeybind = {
      key: null,
      event: null,
      slot: null,
      active: true,
    };

    setCustomKeybinds((previousKeybinds) => [...previousKeybinds, newKeybind]);
  };

  const handleRemove = (index: number) => {
    setCustomKeybinds((previousKeybinds) =>
      previousKeybinds.filter((_, i) => i !== index)
    );
  };

  const handleToggleActive = (index: number) => {
    setCustomKeybinds((previousKeybinds) =>
      previousKeybinds.map((keybind, i) =>
        i === index ? { ...keybind, active: !keybind.active } : keybind
      )
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="fw-bold mb-0">Custom Keybinds</h6>
        <Button
          variant="success"
          size="sm"
          onClick={handleAdd}
          className="d-flex align-items-center"
        >
          <span
            className="material-symbols-outlined me-1"
            style={{ fontSize: "16px" }}
          >
            add
          </span>
          Add Keybind
        </Button>
      </div>

      {/* Container for rows */}
      <div
        className="border rounded overflow-auto"
        style={{
          maxWidth: "100%",
          overflowX: "auto",
          minHeight: "3rem",
        }}
      >
        {/* Header Row */}
        <Row className="fw-semibold text-muted border-bottom py-2 mx-0 bg-light">
          <Col md={3} className="px-2">
            Key
          </Col>
          <Col md={3} className="px-2">
            Device
          </Col>
          <Col md={3} className="px-2">
            Target Event
          </Col>
          <Col md={2} className="px-2">
            Enabled
          </Col>
          <Col md={1} className="px-2"></Col>
        </Row>

        {/* Rows */}
        {customKeybinds.length === 0 ? (
          <Row className="py-3 text-center text-muted mx-0">
            <Col>No keybinds added yet.</Col>
          </Row>
        ) : (
          customKeybinds.map((kb, i) => (
            <CustomKeybindRow
              key={i}
              keybind={kb}
              index={i}
              devicesBySlot={devicesBySlot}
              onToggleActive={handleToggleActive}
              onRemove={handleRemove}
            />
          ))
        )}
      </div>

      {/* Bottom Add Button */}
      <div className="text-center mt-3">
        <Button variant="outline-success" onClick={handleAdd}>
          <span
            className="material-symbols-outlined me-1 align-middle"
            style={{ fontSize: "16px" }}
          >
            add
          </span>
          Add New Keybind
        </Button>
      </div>
    </div>
  );
}
