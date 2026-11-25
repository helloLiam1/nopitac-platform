import { supabase, isSupabaseConfigured } from './supabaseClient.js';

/**
 * Helper to convert a data:image/... URL into a Blob for Supabase Storage upload.
 */
function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:([^;]+)/)?.[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { blob: new Blob([bytes], { type: mime }), mime };
}

export const nopitacService = {
  /**
   * Returns current authenticated Supabase user + profile row (or null if signed out).
   */
  async getCurrentUser() {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;
      const user = session.user;
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      return {
        id: user.id,
        email: user.email,
        username: profile?.username || user.user_metadata?.username || user.email?.split('@')[0] || 'member',
        name: profile?.display_name || profile?.username || user.user_metadata?.name || 'member',
        accent_color: profile?.accent_color || '#6a76ff'
      };
    } catch (err) {
      console.warn('Supabase getCurrentUser failed:', err);
      return null;
    }
  },

  async signUp({ name, username, email, password, accentColor }) {
    if (!isSupabaseConfigured || !supabase) return { error: new Error('Supabase not configured') };
    const cleanUsername = (username || name || email.split('@')[0]).trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          name: (name || cleanUsername).trim(),
          username: cleanUsername
        }
      }
    });
    if (error) return { error };

    if (data.user) {
      await supabase
        .from('profiles')
        .upsert({
          id: data.user.id,
          username: cleanUsername,
          display_name: (name || cleanUsername).trim(),
          accent_color: accentColor || '#6a76ff'
        }, { onConflict: 'id' });
    }
    return { data };
  },

  async signIn({ identifier, password }) {
    if (!isSupabaseConfigured || !supabase) return { error: new Error('Supabase not configured') };
    let email = identifier.trim();
    if (!email.includes('@')) {
      // Allow signing in with username if profile exists; fallback to email lookup
      const { data: prof } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', email.toLowerCase())
        .maybeSingle();
      if (!prof) {
        email = `${email}@nopitac.com`;
      }
    }
    return supabase.auth.signInWithPassword({ email, password });
  },

  async signOut() {
    if (!isSupabaseConfigured || !supabase) return;
    await supabase.auth.signOut();
  },

  async uploadPortraitIfNeeded(userId, imageHref, personName) {
    if (!isSupabaseConfigured || !supabase || !userId || !imageHref) return imageHref || '';
    if (!imageHref.startsWith('data:')) return imageHref;
    try {
      const { blob, mime } = dataUrlToBlob(imageHref);
      const ext = mime.split('/')[1]?.split('+')[0] || 'png';
      const slug = (personName || 'portrait').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const path = `${userId}/${slug}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('portraits')
        .upload(path, blob, { contentType: mime, upsert: true });
      if (error) return imageHref;
      const { data } = supabase.storage.from('portraits').getPublicUrl(path);
      return data?.publicUrl || imageHref;
    } catch (err) {
      console.warn('Portrait upload fallback to data URL:', err);
      return imageHref;
    }
  },

  async fetchBoardByUsername(username) {
    if (!isSupabaseConfigured || !supabase || !username) return null;
    try {
      const key = username.trim().toLowerCase();
      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('id, username, display_name, composition')
        .eq('username', key)
        .maybeSingle();
      if (profErr || !profile) return null;

      const [{ data: domains }, { data: people }] = await Promise.all([
        supabase.from('domains').select('*').eq('owner_id', profile.id),
        supabase.from('people').select('*').eq('owner_id', profile.id).order('created_at', { ascending: true })
      ]);

      return {
        profile,
        domains: domains || [],
        people: people || []
      };
    } catch (err) {
      console.warn('Supabase fetchBoardByUsername failed:', err);
      return null;
    }
  },

  async saveDomain(ownerId, { name, color }) {
    if (!isSupabaseConfigured || !supabase || !ownerId) return;
    await supabase.from('domains').upsert({
      owner_id: ownerId,
      name: name.trim().toLowerCase(),
      color
    }, { onConflict: 'owner_id,name' });
  },

  async upsertPerson(ownerId, personData, originalName = null) {
    if (!isSupabaseConfigured || !supabase || !ownerId) return;
    const cleanName = (personData.fullName || '').trim().toLowerCase();
    if (!cleanName) return;

    const rawHref = personData.photo?.imageHref || (Array.isArray(personData.photos) ? personData.photos[0] : '') || '';
    const photoUrl = await this.uploadPortraitIfNeeded(ownerId, rawHref, cleanName);
    const photoSettings = personData.photo
      ? {
          theme: personData.photo.theme || 'dark',
          imageScale: personData.photo.imageScale || 1.05,
          imagePanX: personData.photo.imagePanX || 0,
          imagePanY: personData.photo.imagePanY || 0,
          imageNaturalWidth: personData.photo.imageNaturalWidth || 200,
          imageNaturalHeight: personData.photo.imageNaturalHeight || 200
        }
      : {};

    const matchName = (originalName || cleanName).trim().toLowerCase();
    const { data: existing } = await supabase
      .from('people')
      .select('id')
      .eq('owner_id', ownerId)
      .eq('full_name', matchName)
      .maybeSingle();

    const payload = {
      owner_id: ownerId,
      full_name: cleanName,
      domain: (personData.domain || 'artists').trim().toLowerCase(),
      domain_color: personData.domainColor || '#27ff83',
      place: (personData.place || '').trim().toLowerCase(),
      birth_year: (personData.year || '').trim(),
      description: (personData.whyCool || personData.description || '').trim(),
      links: (personData.links || '').trim(),
      photo_url: photoUrl,
      photo_settings: photoSettings
    };

    if (existing?.id) {
      await supabase.from('people').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('people').insert(payload);
    }
  },

  async fetchCommunityUsers() {
    if (!isSupabaseConfigured || !supabase) return [];
    try {
      const [{ data: profiles }, { data: people }] = await Promise.all([
        supabase.from('profiles').select('id, username, display_name, composition').order('created_at', { ascending: true }),
        supabase.from('people').select('owner_id, domain, domain_color')
      ]);
      if (!profiles) return [];

      return profiles.map((prof) => {
        const userPeople = (people || []).filter((p) => p.owner_id === prof.id);
        const domainMap = new Map();
        userPeople.forEach((p) => {
          const dn = (p.domain || 'artists').trim().toLowerCase();
          if (!domainMap.has(dn)) {
            domainMap.set(dn, { name: dn, color: p.domain_color || '#27ff83' });
          }
        });
        return {
          name: prof.username,
          composition: prof.composition || 'circle',
          domains: Array.from(domainMap.values()),
          peopleCount: userPeople.length
        };
      });
    } catch (err) {
      console.warn('Supabase fetchCommunityUsers failed:', err);
      return [];
    }
  },

  async getSavedBoardNames(userId) {
    if (!isSupabaseConfigured || !supabase || !userId) return null;
    const { data, error } = await supabase
      .from('saved_boards')
      .select('saved_username')
      .eq('user_id', userId);
    if (error) return null;
    return (data || []).map((r) => r.saved_username);
  },

  async setSavedBoard(userId, savedUsername, shouldSave) {
    if (!isSupabaseConfigured || !supabase || !userId) return;
    const target = savedUsername.trim().toLowerCase();
    if (shouldSave) {
      await supabase.from('saved_boards').upsert({
        user_id: userId,
        saved_username: target
      }, { onConflict: 'user_id,saved_username' });
    } else {
      await supabase.from('saved_boards')
        .delete()
        .eq('user_id', userId)
        .eq('saved_username', target);
    }
  }
};
