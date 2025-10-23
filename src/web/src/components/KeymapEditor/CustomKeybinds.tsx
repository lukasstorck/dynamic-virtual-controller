import { Table, Button, Row, Col, Form } from "react-bootstrap";
import { useDataContext } from "../../hooks/useDataContext";

export default function CustomKeybinds() {
  const { customKeybinds, devicesBySlot } = useDataContext();

  return (
    <div>
      {/* Header */}
      <Row className="align-items-center mb-3">
        <Col>
          <h6 className="fw-bold mb-0">Custom Keybinds</h6>
        </Col>
        <Col className="text-end">
          <Button variant="success" size="sm" onClick={() => alert("on add")}>
            <span
              className="material-symbols-outlined me-1 align-middle"
              style={{ fontSize: "16px" }}
            >
              add
            </span>
            Add Keybind
          </Button>
        </Col>
      </Row>

      {/* Table */}
      <Table striped hover responsive>
        <thead className="table-light">
          {/* TODO: add width */}
          <tr>
            <th>Key</th>
            <th>Device</th>
            <th>Target Event</th>
            <th>Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {customKeybinds.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center text-muted">
                No keybinds added yet.
              </td>
            </tr>
          ) : (
            customKeybinds.map((kb, i) => (
              <tr key={i}>
                <td>{kb.key}</td>
                <td>{kb.slot ? devicesBySlot[kb.slot].name : "None"}</td>
                <td>{kb.event}</td>
                <td>
                  <Form.Check
                    type="switch"
                    id={`active-switch-${i}`}
                    checked={kb.active}
                    onChange={() => alert("on toggle active" + i)}
                  />
                </td>
                <td>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => alert("on remove " + i)}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      {/* Bottom Add Button */}
      <div className="text-center mt-3">
        <Button variant="outline-success" onClick={() => alert("on add")}>
          <span
            className="material-symbols-outlined me-1 align-middle"
            style={{ fontSize: "16px" }}
          >
            add
          </span>
          Add New Keybind
        </Button>
      </div>
    </div>
  );
}
