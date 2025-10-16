import { type FC } from "react";
import { Card } from "react-bootstrap";
import { type Device } from "../../types";

interface Props {
  device: Device;
}

const DeviceCard: FC<Props> = ({ device }) => {
  return (
    <Card className="shadow-sm h-100">
      <Card.Body>
        <Card.Title className="d-flex justify-content-between align-items-center">
          <span>{device.name}</span>
          <small className="text-muted">Slot {device.slot}</small>
        </Card.Title>

        <Card.Text className="mb-1">
          <strong>Ping:</strong> {device.ping ?? "—"}
        </Card.Text>

        <Card.Text className="mb-1">
          <strong>Selected Preset:</strong>{" "}
          {device.selected_preset ?? "—"}
        </Card.Text>

        {device.keybind_presets && (
          <Card.Text className="mb-0">
            <strong>Presets:</strong>{" "}
            {Object.keys(device.keybind_presets).join(", ")}
          </Card.Text>
        )}
      </Card.Body>
    </Card>
  );
};

export default DeviceCard;
