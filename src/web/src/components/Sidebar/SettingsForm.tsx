import { Form, Button } from "react-bootstrap";
import { useDataContext } from "../../hooks/useDataContext";

export default function SettingsForm() {
  // TODO: rename component
  const {
    userName,
    setUserName,
    userColor,
    setUserColor,
    setShowKeybindEditor,
  } = useDataContext();

  return (
    <Form>
      <Form.Group className="mb-3" controlId="userName">
        <Form.Label>Name</Form.Label>
        <Form.Control
          type="text"
          placeholder="Enter your name"
          value={userName}
          onChange={(event) => setUserName(event.target.value)}
        />
      </Form.Group>

      <Form.Group className="mb-3" controlId="userColor">
        <Form.Label>Color</Form.Label>
        <Form.Control
          type="color"
          value={userColor}
          title="Choose your color"
          onChange={(event) => setUserColor(event.target.value)}
          style={{ height: "38px" }}
        />
      </Form.Group>

      <Button
        variant="outline-primary"
        className="w-100"
        onClick={() => setShowKeybindEditor(true)}
      >
        <span
          className="material-symbols-outlined me-1"
          style={{ fontSize: "16px", verticalAlign: "text-bottom" }} // TODO align icon
        >
          edit
        </span>
        Edit Keybinds
      </Button>
    </Form>
  );
}
