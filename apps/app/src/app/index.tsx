import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { Body, Button, Card, Heading, Loading, Row, Screen } from '@/components/ui';
import { errorMessage, useTrips } from '@/lib/api';
import { formatTripDates } from '@/lib/format';
import { takePendingInvite } from '@/lib/pending-invite';

export default function Trips() {
  const router = useRouter();
  const trips = useTrips();

  // This is the first screen after signing in. Someone who came from an invite
  // link and had to sign in first is sent back to that invite from here.
  const [checkedInvite, setCheckedInvite] = useState(false);
  useEffect(() => {
    let cancelled = false;
    takePendingInvite()
      .catch(() => null)
      .then((token) => {
        if (cancelled) return;
        if (token) router.replace(`/invite/${token}`);
        else setCheckedInvite(true);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!checkedInvite || trips.isPending) return <Loading />;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Button label="New trip" onPress={() => router.push('/trips/new')} />
        <Button label="Account" variant="secondary" onPress={() => router.push('/account')} />
      </Row>

      {trips.isError ? <Body tone="danger">{errorMessage(trips.error)}</Body> : null}

      {trips.data?.length === 0 ? (
        <Card>
          <Heading>No trips yet</Heading>
          <Body tone="muted">
            Create a trip, or open an invite link someone has sent you.
          </Body>
        </Card>
      ) : null}

      {trips.data?.map((trip) => (
        <Link key={trip.id} href={`/trips/${trip.id}`} asChild>
          <Pressable accessibilityRole="link">
            <Card>
              <Heading>{trip.title}</Heading>
              <Body tone="muted">{formatTripDates(trip)}</Body>
            </Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}
