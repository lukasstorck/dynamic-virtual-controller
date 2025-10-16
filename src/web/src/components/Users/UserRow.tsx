import { useEffect, useState, type FC } from "react";
import { type User } from "../../types";

interface Props {
  user: User;
}

function formatLastActivity(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";

  const secondsElapsed = Math.floor(Date.now() / 1000 - timestamp);
  if (secondsElapsed < 2) return "just now";

  const hours = Math.floor(secondsElapsed / 3600);
  const minutes = Math.floor((secondsElapsed % 3600) / 60);
  const seconds = secondsElapsed % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if ((hours === 0 && seconds > 0) || parts.length === 0)
    parts.push(`${seconds}s`);

  return parts.join(" ") + " ago";
}

function formatPing(ping: number | null | undefined): string {
  if (ping == null || isNaN(ping)) return "—";
  return `${Math.round(ping)} ms`;
}

const UserRow: FC<Props> = ({ user }) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <tr>
      <td>
        <span
          className="d-inline-block rounded-circle me-2"
          style={{
            backgroundColor: user.color,
            width: 12,
            height: 12,
          }}
        />
        {user.name}
      </td>
      <td>{formatLastActivity(user.last_activity)}</td>
      <td>{formatPing(user.ping)}</td>
      <td>
        {user.selected_output_devices?.length
          ? user.selected_output_devices.join(", ")
          : "None"}
      </td>
    </tr>
  );
};

export default UserRow;
