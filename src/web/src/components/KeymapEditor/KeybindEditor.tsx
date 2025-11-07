import { Modal, Button } from "react-bootstrap";
import { useDataContext } from "../../hooks/useDataContext";

import DeviceOverview from "./DeviceOverview";
import CustomKeybinds from "./CustomKeybinds";

export default function KeybindEditor() {
  const { showKeybindEditor, setShowKeybindEditor } = useDataContext();

  return (
    <Modal
      show={showKeybindEditor}
      size="xl"
      onHide={() => {
        setShowKeybindEditor(false);
      }}
    >
      <Modal.Header closeButton>
        <Modal.Title>Keybind Editor</Modal.Title>
      </Modal.Header>

      <Modal.Body>
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
