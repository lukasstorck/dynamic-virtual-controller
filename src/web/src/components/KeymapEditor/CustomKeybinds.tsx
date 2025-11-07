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

  const handleEditKey = (index: number, newKey: string) => {
    setCustomKeybinds((previousKeybinds) =>
      previousKeybinds.map((keybind, i) =>
        i === index ? { ...keybind, key: newKey } : keybind
      )
    );
  };

  const handleEditSlot = (index: number, newSlot: number | null) => {
    // reset slot and event if new slot is null
    if (newSlot === null) {
      setCustomKeybinds((previousKeybinds) =>
        previousKeybinds.map((keybind, i) =>
          i === index ? { ...keybind, slot: null, event: null } : keybind
        )
      );
      return;
    }

    // check if slot is valid
    if (!(newSlot in devicesBySlot)) return;

    // if the previous event exists on the new device, keep it; otherwise null
    setCustomKeybinds((previousKeybinds) => {
      const newDevice = devicesBySlot[newSlot];
      const previousEvent = previousKeybinds[index]?.event;

      return previousKeybinds.map((keybind, i) => {
        if (i !== index) return keybind;
        const updatedEvent =
          previousEvent && newDevice.allowedEvents.includes(previousEvent)
            ? previousEvent
            : null;
        return { ...keybind, slot: newSlot, event: updatedEvent };
      });
    });
  };

  const handleEditEvent = (index: number, newEvent: string) => {
    // check if device slot is set
    const slot = customKeybinds[index].slot;
    if (slot == null) return;

    const device = devicesBySlot[slot];

    // check if event is allowed for selected device
    if (!device || !device.allowedEvents.includes(newEvent)) return;

    setCustomKeybinds((previousKeybinds) =>
      previousKeybinds.map((keybind, i) =>
        i === index ? { ...keybind, event: newEvent } : keybind
      )
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
          <span className="material-symbols-outlined me-1 fs-5">add</span>
          Add Keybind
        </Button>
      </div>

      {/* Table Container */}
      <div className="border rounded overflow-auto">
        {/* Header Row */}
        <Row className="fw-semibold text-muted border-bottom py-2 mx-0 bg-light">
          <Col md={3} className="px-2">
            Key
          </Col>
          <Col md={3} className="px-2">
            Device
          </Col>
          <Col md={4} className="px-2">
            Target Event
          </Col>
          <Col md={1} className="px-2">
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
              onEditKey={handleEditKey}
              onEditSlot={handleEditSlot}
              onEditEvent={handleEditEvent}
            />
          ))
        )}
      </div>

      {/* Add New Keybind Button */}
      <div className="d-flex justify-content-center mt-3">
        <Button
          variant="success"
          size="sm"
          onClick={handleAdd}
          className="d-flex align-items-center"
        >
          <span className="material-symbols-outlined me-1 fs-5">add</span>
          Add Keybind
        </Button>
      </div>
    </div>
  );
}
