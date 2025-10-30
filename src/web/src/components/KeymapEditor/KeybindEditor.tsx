import { Modal, Button } from "react-bootstrap";
import { useDataContext } from "../../hooks/useDataContext";

import DeviceOverview from "./DeviceOverview";
import CustomKeybinds from "./CustomKeybinds";

export default function KeybindEditor() {
  const { showKeybindEditor, setShowKeybindEditor } = useDataContext();

  return (
    // TODO: add functionality
    // TODO: ensure that keypresses are not active during open modal
    <Modal
      show={showKeybindEditor}
      size="xl"
      onHide={() => setShowKeybindEditor(false)}
    >
      <Modal.Header closeButton>
        <Modal.Title>Keybind Editor</Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ maxHeight: "80vh", overflowY: "auto" }}>
        <DeviceOverview />
        <CustomKeybinds />
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={() => setShowKeybindEditor(false)}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
