// CustomKeybindRow.tsx
import { type JSX, useEffect, useMemo } from "react";
import { Button, Col, Form, Row } from "react-bootstrap";

import { useDataContext } from "../../hooks/useDataContext";
import type { CustomKeybind } from "../../types";

interface CustomKeybindRowProps {
  index: number;
  keybind: CustomKeybind;
  onEditEvent: (index: number, newEvent: string) => void;
  onEditKey: (index: number, newKey: string) => void;
  onEditSlot: (index: number, newSlot: number | null) => void;
  onRemove: (index: number) => void;
  onToggleActive: (index: number) => void;
}

export default function CustomKeybindRow({
  index,
  keybind,
  onEditEvent,
  onEditKey,
  onEditSlot,
  onRemove,
  onToggleActive,
}: CustomKeybindRowProps) {
  const {
    customKeybindActiveListener,
    setCustomKeybindActiveListener,
    devicesBySlot,
  } = useDataContext();

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

  const deviceOptions = [
    <option key="-1" value={-1}>
      Browser
    </option>,
    ...Object.values(devicesBySlot).map((device) => (
      <option key={device.slot} value={device.slot}>
        {`${device.slot}: ${device.name}`}
      </option>
    )),
  ];

  const isBrowserSelected = keybind.slot === -1;
  const currentDevice =
    keybind.slot !== null && !isBrowserSelected && devicesBySlot[keybind.slot]
      ? devicesBySlot[keybind.slot]
      : null;

  const eventOptions = useMemo(() => {
    const options: JSX.Element[] = [];

    if (isBrowserSelected) {
      // Browser pseudo-device events
      const slotNumbers = Object.keys(devicesBySlot)
        .map((n) => Number(n))
        .sort((a, b) => a - b);

      slotNumbers.forEach((slot) => {
        options.push(
          <option key={`switch-${slot}`} value={`Switch to Slot ${slot}`}>
            Switch to Slot {slot}
          </option>
        );
      });

      slotNumbers.forEach((slot) => {
        options.push(
          <option key={`toggle-${slot}`} value={`Toggle Slot ${slot}`}>
            Toggle Slot {slot}
          </option>
        );
      });

      options.push(
        <option key="switch-previous" value="Switch to previous Slot">
          Switch to previous Slot
        </option>
      );
      options.push(
        <option key="switch-next" value="Switch to next Slot">
          Switch to next Slot
        </option>
      );
    } else if (currentDevice) {
      currentDevice.allowedEvents.forEach((evt) =>
        options.push(
          <option key={evt} value={evt}>
            {evt}
          </option>
        )
      );
    }

    return options;
  }, [index, devicesBySlot, currentDevice]);

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
          disabled={!currentDevice && !isBrowserSelected}
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
