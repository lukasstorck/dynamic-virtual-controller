import { Row, Col, Card } from "react-bootstrap";
import { useDataContext } from "../../hooks/useDataContext";

export default function DeviceOverview() {
  const { devices } = useDataContext();
  return (
    <div className="mb-4">
      <h6 className="fw-bold mb-3">Device Configuration</h6>
      <Row className="g-3" id="device-overview-container">
        {devices.length === 0 ? (
          <Col>
            <Card className="text-center text-muted fst-italic p-3">
              No devices connected.
            </Card>
          </Col>
        ) : (
          // TODO: use Device Card component as in main view
          devices.map((device, i) => (
            <Col key={i} md={4}>
              <Card className="h-100 shadow-sm">
                <Card.Body>
                  <Card.Title>{device.name}</Card.Title>
                  <Card.Text className="text-muted small mb-1">
                    {/* TODO: add or remove device type */}
                    Type: {"Unknown"}
                  </Card.Text>
                  <Card.Text className="text-muted small">
                    ID: {device.id || "N/A"}
                  </Card.Text>
                </Card.Body>
              </Card>
            </Col>
          ))
        )}
      </Row>
    </div>
  );
}
