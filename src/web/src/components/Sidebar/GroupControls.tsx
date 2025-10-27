import { useCallback } from "react";
import { Form, Button, Stack } from "react-bootstrap";
import { useDataContext } from "../../hooks/useDataContext";

export default function GroupControls() {
  const {
    groupId,
    setGroupId,
    handleJoinGroup,
    handleLeaveGroup,
    isConnected,
  } = useDataContext();

  const handleCopyGroupLink = useCallback(() => {
    const params = new URLSearchParams({
      group_id: groupId,
    }).toString();
    const link = `${window.location.origin}?${params}`;
    navigator.clipboard.writeText(link);
  }, [groupId]);

  return (
    <>
      {!isConnected ? (
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            handleJoinGroup(groupId);
          }}
        >
          <Form.Group className="mb-3" controlId="groupId">
            <Form.Label>Group ID</Form.Label>
            <Form.Control
              type="password"
              placeholder="leave blank for a new group"
              value={groupId ? groupId : ""}
              onChange={(e) => setGroupId(e.target.value)}
            />
          </Form.Group>
          <Button
            variant="primary"
            className="w-100"
            onClick={() => handleJoinGroup(groupId)}
          >
            Join Group
          </Button>
        </Form>
      ) : (
        <Stack gap={2}>
          <Button
            variant="outline-secondary"
            className="w-100"
            onClick={() => handleCopyGroupLink()}
          >
            Copy Group Link
          </Button>

          <Button
            variant="outline-danger"
            className="w-100"
            onClick={() => handleLeaveGroup()}
          >
            Leave Group
          </Button>
        </Stack>
      )}
    </>
  );
}
