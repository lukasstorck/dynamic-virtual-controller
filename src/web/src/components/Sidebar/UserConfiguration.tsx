import { Form, Button } from "react-bootstrap";
import { useDataContext } from "../../hooks/useDataContext";

export default function UserConfiguration() {
  const {
    userName,
    setUserName,
    userColor,
    setUserColor,
    setShowKeybindEditor,
  } = useDataContext();

  return (
    <div>
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
        />
      </Form.Group>

      <Button
        variant="outline-primary"
        className="w-100 d-flex justify-content-center align-items-center"
        onClick={(event) => {
          event.currentTarget.blur();
          setShowKeybindEditor(true);
        }}
      >
        <span className="material-symbols-outlined me-1 fs-5">edit</span>
        Edit Keybinds
      </Button>
    </div>
  );
}
