// CustomKeybindRow.tsx
import { Row, Col, Button, Form } from "react-bootstrap";
import type { CustomKeybind, Device } from "../../types";

interface CustomKeybindRowProps {
  keybind: CustomKeybind;
  index: number;
  devicesBySlot: Record<number, Device>;
  onToggleActive: (index: number) => void;
  onRemove: (index: number) => void;
}

export default function CustomKeybindRow({
  keybind,
  index,
  devicesBySlot,
  onToggleActive,
  onRemove,
}: CustomKeybindRowProps) {
  const deviceLabel =
    keybind.slot !== null && devicesBySlot[keybind.slot]
      ? `${keybind.slot}: ${devicesBySlot[keybind.slot].name}`
      : "None";

  return (
    <Row
      className="align-items-center gx-2 border-bottom py-2 mx-0"
      style={{
        fontSize: "0.9rem",
        overflow: "hidden",
      }}
    >
      <Col xs={12} md={3} className="text-truncate px-2">
        {keybind.key || <span className="text-muted">—</span>}
      </Col>

      <Col xs={12} md={3} className="text-truncate px-2">
        {deviceLabel}
      </Col>

      <Col xs={12} md={3} className="text-truncate px-2">
        {keybind.event || <span className="text-muted">—</span>}
      </Col>

      <Col xs={6} md={2} className="px-2">
        <Form.Check
          type="switch"
          id={`active-switch-${index}`}
          checked={keybind.active}
          onChange={() => onToggleActive(index)}
        />
      </Col>

      <Col xs={6} md={1} className="text-end px-2">
        <Button
          variant="outline-danger"
          size="sm"
          onClick={() => onRemove(index)}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            delete
          </span>
        </Button>
      </Col>
    </Row>
  );
}
