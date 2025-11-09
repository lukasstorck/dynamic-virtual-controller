import { Button, Modal } from "react-bootstrap";

import CustomKeybinds from "./CustomKeybinds";
import DeviceOverview from "./DeviceOverview";
import { useDataContext } from "../../hooks/useDataContext";

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
