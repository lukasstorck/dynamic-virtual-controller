// CustomKeybindRow.tsx
import { useEffect, useState } from "react";
import { Row, Col, Button, Form } from "react-bootstrap";
import type { CustomKeybind, Device } from "../../types";

interface CustomKeybindRowProps {
  keybind: CustomKeybind;
  index: number;
  devicesBySlot: Record<number, Device>;
  onToggleActive: (index: number) => void;
  onRemove: (index: number) => void;
  onEditKey: (index: number, newKey: string) => void;
  onEditSlot: (index: number, newSlot: number) => void;
  onEditEvent: (index: number, newEvent: string) => void;
}

// module-level singleton for listening
let activeKeyListener: number | null = null;

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
  const [listening, setListening] = useState(false);

  // Attach / detach key listener dynamically
  useEffect(() => {
    if (!listening) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      onEditKey(index, e.code);
      setListening(false);
      activeKeyListener = null;
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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

  const eventOptions = currentDevice
    ? currentDevice.allowedEvents.map((evt) => (
        <option key={evt} value={evt}>
          {evt}
        </option>
      ))
    : [
        <option key="none" value="">
          Select device first
        </option>,
      ];

  const handleStartListening = () => {
    // TODO: other listeners are not stopped, at least button is still yellow
    // TODO: check that there are no bugs with button presses propagating like Esc, or a selected key directly being sent to a device

    // stop any other active listeners
    if (activeKeyListener !== null && activeKeyListener !== index) {
      const previousButton = document.querySelector(
        `[data-keylistener="${activeKeyListener}"]`
      ) as HTMLButtonElement | null;
      if (previousButton) previousButton.blur();
    }

    activeKeyListener = index;
    setListening(true);
  };

  const handleSlotChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const slotNum = Number(e.target.value);
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
          {listening ? "Press any key..." : keybind.key || "Set Key"}
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
          {eventOptions}
        </Form.Select>
      </Col>

      {/* Active switch */}
      {/* TODO: UX user might think that toggle means it is also sent to the device, but that is different */}
      <Col xs={6} md={1} className="px-2">
        <Form.Check
          type="switch"
          id={`active-switch-${index}`}
          checked={keybind.active}
          onChange={() => onToggleActive(index)}
        />
      </Col>

      {/* Remove */}
      <Col xs={6} md={1} className="text-end px-2">
        <Button
          variant="outline-danger"
          size="sm"
          onClick={() => onRemove(index)}
          className="d-flex align-items-center p-2"
        >
          <span className="material-symbols-outlined fs-6">delete</span>
        </Button>
      </Col>
    </Row>
  );
}
