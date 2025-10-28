import { useCallback, useEffect, useRef } from "react";
import { Form, Button, Stack } from "react-bootstrap";
import { useDataContext } from "../../hooks/useDataContext";

export default function GroupControls() {
  const groupIdInputRef = useRef<HTMLInputElement>(null);
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

  const handleEnterKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      handleJoinGroup(groupId);
    },
    [handleJoinGroup, groupId]
  );

  useEffect(() => {
    groupIdInputRef.current?.addEventListener("keydown", handleEnterKey);
    return () => {
      groupIdInputRef.current?.removeEventListener("keydown", handleEnterKey);
    };
  });

  return (
    <>
      {!isConnected ? (
        <div>
          <Form.Group className="mb-3" controlId="groupId">
            <Form.Label>Group ID</Form.Label>
            <Form.Control
              ref={groupIdInputRef}
              type="password"
              placeholder="leave blank for a new group"
              value={groupId ? groupId : ""}
              onChange={(event) => setGroupId(event.target.value)}
            />
          </Form.Group>
          <Button
            variant="primary"
            className="w-100"
            onClick={() => handleJoinGroup(groupId)}
          >
            Join Group
          </Button>
        </div>
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
