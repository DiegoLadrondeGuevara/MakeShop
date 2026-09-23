package com.OpenStore.user.user.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import com.OpenStore.user.user.domain.User;
import com.OpenStore.user.user.domain.UserRole;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByEmail(String email);
    Optional<User> findByPhoneNumber(String phoneNumber);
    Optional<User> findByName(String name);
    Optional<User> findByNameIgnoreCase(String name);
    Page<User> findByShopId(UUID shopId, Pageable pageable);
    Page<User> findByShopIdAndRoleNot(UUID shopId, UserRole role, Pageable pageable);
    Page<User> findByShopIdIn(Collection<UUID> shopIds, Pageable pageable);
    Page<User> findByShopIdInAndRoleNot(Collection<UUID> shopIds, UserRole role, Pageable pageable);
    Page<User> findByRole(UserRole role, Pageable pageable);
    List<User> findByShopId(UUID shopId);
    List<User> findByShopIdAndRoleNot(UUID shopId, UserRole role);
}
