// CustomKeybindRow.tsx
import { useEffect, useMemo } from "react";
import { Row, Col, Button, Form } from "react-bootstrap";
import type { CustomKeybind, Device } from "../../types";
import { useDataContext } from "../../hooks/useDataContext";

interface CustomKeybindRowProps {
  keybind: CustomKeybind;
  index: number;
  devicesBySlot: Record<number, Device>;
  onToggleActive: (index: number) => void;
  onRemove: (index: number) => void;
  onEditKey: (index: number, newKey: string) => void;
  onEditSlot: (index: number, newSlot: number | null) => void;
  onEditEvent: (index: number, newEvent: string) => void;
}

export default function CustomKeybindRow({
  keybind,
  index,
  devicesBySlot,
  onToggleActive,
  onRemove,
  onEditKey,
  onEditSlot,
  onEditEvent,
}: CustomKeybindRowProps) {
  const { customKeybindActiveListener, setCustomKeybindActiveListener } =
    useDataContext();

  const listening = useMemo(
    () => index === customKeybindActiveListener,
    [customKeybindActiveListener]
  );

  useEffect(() => {
    if (!listening) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onEditKey(index, event.code);

      setCustomKeybindActiveListener(null);
      (document.activeElement as HTMLElement)?.blur();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [listening, index, onEditKey]);

  const deviceOptions = Object.values(devicesBySlot).map((device) => (
    <option key={device.slot} value={device.slot}>
      {`${device.slot}: ${device.name}`}
    </option>
  ));

  const currentDevice =
    keybind.slot !== null && devicesBySlot[keybind.slot]
      ? devicesBySlot[keybind.slot]
      : null;

  const eventOptions = [
    ...(currentDevice
      ? currentDevice.allowedEvents.map((evt) => (
          <option key={evt} value={evt}>
            {evt}
          </option>
        ))
      : []),
  ];

  const handleStartListening = () => {
    setCustomKeybindActiveListener(index);
  };

  const handleSlotChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const slotNum = value === "" ? null : Number(value);
    onEditSlot(index, slotNum);
  };

  const handleEventChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newEvent = e.target.value;
    onEditEvent(index, newEvent);
  };

  return (
    <Row className="align-items-center gx-2 border-bottom py-2 mx-0 overflow-hidden">
      {/* Key selection */}
      <Col xs={12} md={3} className="px-2">
        <Button
          variant={listening ? "warning" : "outline-secondary"}
          size="sm"
          className="w-100 text-truncate"
          onClick={handleStartListening}
          data-keylistener={index}
        >
          {listening ? "Press any key..." : keybind.key || "!! Set Key !!"}
        </Button>
      </Col>

      {/* Device Slot */}
      <Col xs={12} md={3} className="px-2">
        <Form.Select
          size="sm"
          value={keybind.slot ?? ""}
          onChange={handleSlotChange}
        >
          <option value="">Select device...</option>
          {deviceOptions}
        </Form.Select>
      </Col>

      {/* Event Selection */}
      <Col xs={12} md={4} className="px-2">
        <Form.Select
          size="sm"
          value={keybind.event ?? ""}
          onChange={handleEventChange}
          disabled={!currentDevice}
        >
          <option value="">Select event...</option>
          {eventOptions}
        </Form.Select>
      </Col>

      {/* Active switch */}
      <Col xs={6} md={1} className="px-2">
        <Form.Check
          type="switch"
          id={`active-switch-${index}`}
          checked={keybind.active}
          onChange={(event) => {
            event.target.blur();
            onToggleActive(index);
          }}
        />
      </Col>

      {/* Remove Keybind Button */}
      <Col xs={6} md={1} className="text-end px-2">
        <Button
          variant="danger"
          size="sm"
          onClick={(event) => {
            event.currentTarget.blur();
            onRemove(index);
          }}
          className="d-flex align-items-center p-2"
        >
          <span className="material-symbols-outlined fs-6">delete</span>
        </Button>
      </Col>
    </Row>
  );
}
